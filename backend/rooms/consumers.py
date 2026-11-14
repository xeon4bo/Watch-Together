import json
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone
from .models import ChatMessage, Membership, Room
from .serializers import ChatMessageSerializer, UserSerializer

@database_sync_to_async
def public_user(user_id):
    return UserSerializer(get_user_model().objects.get(id=user_id)).data

@database_sync_to_async
def room_state(room_id):
    try:
        room = Room.objects.get(id=room_id)
        return {
            "type": "playback_state", "video_url": room.video_url,
            "position": room.current_position, "is_playing": room.is_playing,
            "updated_at": room.playback_updated_at.isoformat(),
            "owner_id": room.owner_id, "host_controls_only": room.host_controls_only,
            "voice_enabled": room.voice_enabled, "video_enabled": room.video_enabled,
            "is_locked": room.is_locked,
        }
    except Room.DoesNotExist:
        return None

@database_sync_to_async
def is_member(room_id, user_id):
    return Membership.objects.filter(room_id=room_id, user_id=user_id).exists()

@database_sync_to_async
def room_call_enabled(room_id, mode="video"):
    try:
        room = Room.objects.get(id=room_id)
        return room.voice_enabled and (mode == "audio" or room.video_enabled)
    except Room.DoesNotExist:
        return False

@database_sync_to_async
def apply_event(room_id, user_id, event):
    try:
        room = Room.objects.select_related("owner").get(id=room_id)
    except Room.DoesNotExist:
        return None
    kind = event.get("type")
    if kind in {"play", "pause", "seek", "video_changed"}:
        if room.host_controls_only and room.owner_id != user_id:
            return {"error": "Playback controls are restricted to the host."}
        if kind == "video_changed":
            url = str(event.get("video_url", "")).strip()
            if not url.startswith(("https://", "http://")) or len(url) > 2048:
                return {"error": "Enter a valid http(s) video URL."}
            room.video_url, room.playback_position, room.is_playing = url, 0, False
        elif kind == "seek":
            try:
                room.playback_position = max(0, min(float(event.get("position", 0)), 86400))
            except (TypeError, ValueError):
                return {"error": "Seek position must be a number."}
            room.is_playing = bool(event.get("is_playing", room.is_playing))
        else:
            room.playback_position = room.current_position
            room.is_playing = kind == "play"
        room.playback_updated_at = timezone.now()
        room.save(update_fields=["video_url", "playback_position", "is_playing", "playback_updated_at"])
        return {
            "type": "playback_state", "video_url": room.video_url,
            "position": room.playback_position, "is_playing": room.is_playing,
            "updated_at": room.playback_updated_at.isoformat(), "by": user_id,
        }
    if kind == "chat_message":
        text = str(event.get("text", "")).strip()
        if not text or len(text) > 2000:
            return {"error": "Messages must contain 1–2000 characters."}
        message = ChatMessage.objects.create(room=room, user_id=user_id, text=text)
        return {"type": "chat_message", "message": ChatMessageSerializer(message).data}
    return None

class RoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.room_id = str(self.scope["url_route"]["kwargs"]["room_id"])
        user = self.scope["user"]
        if not user.is_authenticated or not await is_member(self.room_id, user.id):
            await self.close(code=4403)
            return
        self.group_name = f"room_{self.room_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        user_data = await public_user(user.id)
        await self.channel_layer.group_send(self.group_name, {
            "type": "room.event", "payload": {"type": "user_joined", "user": user_data},
        })
        state = await room_state(self.room_id)
        if state:
            await self.send_json(state)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            user = self.scope.get("user")
            if user and user.is_authenticated:
                user_data = await public_user(user.id)
                await self.channel_layer.group_send(self.group_name, {
                    "type": "room.event", "payload": {"type": "user_left", "user": user_data},
                })

    async def receive_json(self, content, **kwargs):
        if not await is_member(self.room_id, self.scope["user"].id):
            await self.close(code=4403)
            return
        event_type = content.get("type")
        if event_type in {"offer", "answer", "ice_candidate"}:
            mode = content.get("mode", "video")
            if mode not in {"audio", "video"}:
                await self.send_json({"type": "error", "detail": "Choose audio or video for the call."})
                return
            if not await room_call_enabled(self.room_id, mode):
                await self.send_json({"type": "error", "detail": "This call mode is disabled for the room."})
                return
            target = content.get("target")
            if target:
                await self.channel_layer.group_send(self.group_name, {
                    "type": "room.event", "payload": {**content, "from": self.scope["user"].id},
                })
            return
        if event_type in {"typing", "voice_state_changed", "camera_state_changed", "call_joined", "call_left"}:
            if event_type == "call_joined":
                mode = content.get("mode", "video")
                if mode not in {"audio", "video"}:
                    await self.send_json({"type": "error", "detail": "Choose audio or video for the call."})
                    return
                if not await room_call_enabled(self.room_id, mode):
                    await self.send_json({"type": "error", "detail": "This call mode is disabled for the room."})
                    return
            await self.channel_layer.group_send(self.group_name, {
                "type": "room.event", "payload": {
                    **content,
                    "user": self.scope["user"].username,
                    "user_id": self.scope["user"].id,
                },
            })
            return
        result = await apply_event(self.room_id, self.scope["user"].id, content)
        if result and result.get("error"):
            await self.send_json({"type": "error", "detail": result["error"]})
        elif result:
            await self.channel_layer.group_send(self.group_name, {"type": "room.event", "payload": result})

    async def room_event(self, event):
        await self.send_json(event["payload"])
