from io import BytesIO
from unittest.mock import MagicMock, patch
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from PIL import Image
from rest_framework.authtoken.models import Token
from config.asgi import application
from rest_framework.test import APIClient
from .consumers import apply_event
from .models import Membership, Room
from .views import upload_avatar_to_filebox

class RoomApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="host", password="long-password-123")
        self.guest = User.objects.create_user(username="guest", password="long-password-123")
        self.room = Room.objects.create(name="Movie night", owner=self.owner)
        Membership.objects.create(room=self.room, user=self.owner)
        self.client = APIClient()

    def test_service_root_is_public_and_reports_api_status(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "service": "Watch Together API",
            "status": "ok",
            "health": "/health/",
        })

    def test_guest_can_join_private_invite_and_read_room(self):
        self.client.force_authenticate(self.guest)
        joined = self.client.post(f"/api/rooms/{self.room.id}/")
        self.assertEqual(joined.status_code, 200)
        self.assertEqual(self.client.get(f"/api/rooms/{self.room.id}/").status_code, 200)

    def test_room_creation_accepts_extensionless_stream_url(self):
        self.client.force_authenticate(self.owner)
        url = "https://example.com/stream/1010?hash=sample"
        response = self.client.post("/api/rooms/", {
            "name": "Stream night",
            "video_url": url,
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["video_url"], url)

    @patch("rooms.views.upload_avatar_to_filebox", return_value="https://xeonfilebox.onrender.com/file/123?hash=abc")
    def test_profile_photo_is_saved_and_can_be_removed(self, upload_avatar):
        self.client.force_authenticate(self.owner)
        image_buffer = BytesIO()
        Image.new("RGB", (4, 4), color="red").save(image_buffer, format="PNG")
        image = SimpleUploadedFile("avatar.png", image_buffer.getvalue(), content_type="image/png")

        response = self.client.patch("/api/auth/me/avatar/", {"avatar": image}, format="multipart")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["avatar_url"], "https://xeonfilebox.onrender.com/file/123?hash=abc")
        upload_avatar.assert_called_once()
        removed = self.client.delete("/api/auth/me/avatar/")
        self.assertEqual(removed.status_code, 200)
        self.assertIsNone(removed.data["avatar_url"])

    def test_profile_photo_rejects_non_image_files(self):
        self.client.force_authenticate(self.owner)
        file = SimpleUploadedFile("not-an-image.png", b"not an image", content_type="image/png")

        response = self.client.patch("/api/auth/me/avatar/", {"avatar": file}, format="multipart")

        self.assertEqual(response.status_code, 400)

    @patch("rooms.views.urlopen")
    def test_profile_photo_filebox_upload_uses_documented_multipart_response(self, open_remote):
        remote_response = MagicMock()
        remote_response.__enter__.return_value.read.return_value = b'{"ok":true,"message_id":12,"file_url":"https://xeonfilebox.onrender.com/file/12?hash=abc"}'
        open_remote.return_value = remote_response
        image_buffer = BytesIO()
        Image.new("RGB", (4, 4), color="blue").save(image_buffer, format="PNG")
        image = SimpleUploadedFile("avatar.png", image_buffer.getvalue(), content_type="image/png")

        avatar_url = upload_avatar_to_filebox(image)

        request = open_remote.call_args.args[0]
        self.assertEqual(request.full_url, "https://xeonfilebox.onrender.com/api/upload")
        self.assertIn(b'name="file"', request.data)
        self.assertEqual(avatar_url, "https://xeonfilebox.onrender.com/file/12?hash=abc")

    def test_playback_updates_are_shared_and_host_control_setting_is_enforced(self):
        self.room.host_controls_only = True
        self.room.save()
        denied = async_to_sync(apply_event)(str(self.room.id), self.guest.id, {"type": "pause"})
        self.assertIn("error", denied)
        result = async_to_sync(apply_event)(str(self.room.id), self.owner.id, {"type": "seek", "position": 42, "is_playing": True})
        self.assertEqual(result["type"], "playback_state")
        self.assertEqual(result["position"], 42)
        self.assertTrue(result["is_playing"])

    def test_only_owner_can_remove_room_member(self):
        Membership.objects.create(room=self.room, user=self.guest)
        self.client.force_authenticate(self.guest)
        denied = self.client.delete(f"/api/rooms/{self.room.id}/members/{self.guest.id}/")
        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(self.owner)
        removed = self.client.delete(f"/api/rooms/{self.room.id}/members/{self.guest.id}/")
        self.assertEqual(removed.status_code, 204)
        self.assertFalse(Membership.objects.filter(room=self.room, user=self.guest).exists())

class RoomSocketTests(TransactionTestCase):
    def test_audio_call_is_allowed_when_video_calls_are_disabled(self):
        user = User.objects.create_user(username="voice-user", password="long-password-123")
        room = Room.objects.create(name="Voice room", owner=user, video_enabled=False)
        Membership.objects.create(room=room, user=user)
        token = Token.objects.create(user=user)

        async def exercise_socket():
            communicator = WebsocketCommunicator(application, f"/ws/rooms/{room.id}/?token={token.key}")
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            received = [await communicator.receive_json_from(timeout=1) for _ in range(2)]
            self.assertTrue(any(event["type"] == "playback_state" for event in received))

            await communicator.send_json_to({"type": "call_joined", "mode": "audio"})
            event = await communicator.receive_json_from(timeout=1)
            while event["type"] != "call_joined":
                event = await communicator.receive_json_from(timeout=1)
            self.assertEqual(event["user_id"], user.id)

            await communicator.send_json_to({"type": "call_joined", "mode": "video"})
            event = await communicator.receive_json_from(timeout=1)
            self.assertEqual(event["type"], "error")
            await communicator.disconnect()

        async_to_sync(exercise_socket)()

    def test_authenticated_socket_receives_authoritative_playback_events(self):
        user = User.objects.create_user(username="socket-user", password="long-password-123")
        room = Room.objects.create(name="Socket room", owner=user)
        Membership.objects.create(room=room, user=user)
        token = Token.objects.create(user=user)

        async def exercise_socket():
            communicator = WebsocketCommunicator(application, f"/ws/rooms/{room.id}/?token={token.key}")
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            received = [await communicator.receive_json_from(timeout=1) for _ in range(2)]
            self.assertTrue(any(event["type"] == "playback_state" for event in received))
            await communicator.send_json_to({"type": "seek", "position": 31, "is_playing": False})
            event = await communicator.receive_json_from(timeout=1)
            while event["type"] != "playback_state":
                event = await communicator.receive_json_from(timeout=1)
            self.assertEqual(event["position"], 31)
            await communicator.disconnect()

        async_to_sync(exercise_socket)()
