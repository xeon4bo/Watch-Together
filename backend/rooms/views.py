import json
import os
import uuid
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.http import JsonResponse
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.views import APIView
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen
from .models import ChatMessage, Membership, Room, UserProfile
from .serializers import AvatarUploadSerializer, ChatMessageSerializer, RoomSerializer, UserSerializer

FILEBOX_BASE_URL = "https://xeonfilebox.onrender.com"

class AvatarStorageError(Exception):
    pass

def upload_avatar_to_filebox(uploaded):
    boundary = f"----WatchTogether{uuid.uuid4().hex}"
    filename = os.path.basename(uploaded.name).replace('"', "_").replace("\r", "_").replace("\n", "_")
    content_type = uploaded.content_type or "application/octet-stream"
    uploaded.seek(0)
    body = (
        f"--{boundary}\r\n".encode()
        + f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
        + f"Content-Type: {content_type}\r\n\r\n".encode()
        + uploaded.read()
        + f"\r\n--{boundary}--\r\n".encode()
    )
    request = Request(
        f"{FILEBOX_BASE_URL}/api/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            result = json.loads(response.read(1024 * 1024))
    except HTTPError as error:
        raise AvatarStorageError(f"Photo storage returned HTTP {error.code}.") from error
    except URLError as error:
        raise AvatarStorageError("Could not reach the photo storage service.") from error
    except (TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise AvatarStorageError("Photo storage returned an invalid response.") from error

    if not isinstance(result, dict) or not result.get("ok"):
        detail = result.get("error") if isinstance(result, dict) else None
        raise AvatarStorageError(detail or "Photo storage rejected the upload.")
    avatar_url = result.get("file_url") or result.get("stream_url")
    if not avatar_url and result.get("message_id") and result.get("hash"):
        avatar_url = f"/file/{quote(str(result['message_id']), safe='')}?hash={quote(str(result['hash']), safe='')}"
    if not avatar_url:
        raise AvatarStorageError("Photo storage did not return a file URL.")
    avatar_url = urljoin(f"{FILEBOX_BASE_URL}/", avatar_url)
    parsed_url = urlparse(avatar_url)
    if parsed_url.scheme != "https" or parsed_url.hostname != "xeonfilebox.onrender.com":
        raise AvatarStorageError("Photo storage returned an unsupported file URL.")
    return avatar_url

@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return JsonResponse({"status": "ok"})

class RegisterView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        if len(username) < 3 or len(password) < 8:
            return Response({"detail": "Use a username with at least 3 characters and a password with at least 8."}, status=400)
        if User.objects.filter(username__iexact=username).exists():
            return Response({"detail": "That username is already taken."}, status=400)
        user = User.objects.create_user(username=username, password=password)
        return Response({"token": Token.objects.create(user=user).key, "user": UserSerializer(user).data}, status=201)

class LoginView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        user = authenticate(username=request.data.get("username", ""), password=request.data.get("password", ""))
        if user is None:
            return Response({"detail": "Invalid username or password."}, status=400)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})

class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

class AvatarView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def patch(self, request):
        serializer = AvatarUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            avatar_url = upload_avatar_to_filebox(serializer.validated_data["avatar"])
        except AvatarStorageError as error:
            return Response({"detail": str(error)}, status=502)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.avatar_url = avatar_url
        profile.save(update_fields=["avatar_url"])
        return Response(UserSerializer(request.user).data)

    def delete(self, request):
        try:
            profile = request.user.profile
        except UserProfile.DoesNotExist:
            return Response(UserSerializer(request.user).data)
        if profile.avatar_url:
            profile.avatar_url = ""
            profile.save(update_fields=["avatar_url"])
        return Response(UserSerializer(request.user).data)

class RoomListCreateView(APIView):
    def get(self, request):
        rooms = Room.objects.filter(memberships__user=request.user).order_by("-created_at").distinct()
        return Response(RoomSerializer(rooms, many=True).data)
    def post(self, request):
        serializer = RoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = serializer.save(owner=request.user)
        Membership.objects.create(room=room, user=request.user)
        return Response(RoomSerializer(room).data, status=201)

class RoomDetailView(APIView):
    def get_room(self, room_id):
        try:
            return Room.objects.get(id=room_id)
        except (Room.DoesNotExist, ValueError):
            return None
    def get(self, request, room_id):
        room = self.get_room(room_id)
        if room is None or not Membership.objects.filter(room=room, user=request.user).exists():
            return Response({"detail": "Room not found or you are not a member."}, status=404)
        data = RoomSerializer(room).data
        data["messages"] = ChatMessageSerializer(room.messages.select_related("user").order_by("-created_at")[:100][::-1], many=True).data
        return Response(data)
    def post(self, request, room_id):
        room = self.get_room(room_id)
        if room is None:
            return Response({"detail": "Room not found."}, status=404)
        if room.is_locked and room.owner_id != request.user.id and not Membership.objects.filter(room=room, user=request.user).exists():
            return Response({"detail": "This room is locked."}, status=403)
        Membership.objects.get_or_create(room=room, user=request.user)
        return Response(RoomSerializer(room).data)
    def patch(self, request, room_id):
        room = self.get_room(room_id)
        if room is None or room.owner_id != request.user.id:
            return Response({"detail": "Only the room owner can change room settings."}, status=403)
        allowed = {"name", "is_locked", "host_controls_only", "voice_enabled", "video_enabled"}
        for field in allowed.intersection(request.data):
            setattr(room, field, request.data[field])
        room.save()
        async_to_sync(get_channel_layer().group_send)(f"room_{room.id}", {
            "type": "room.event",
            "payload": {
                "type": "room_settings",
                "settings": {field: getattr(room, field) for field in allowed},
            },
        })
        return Response(RoomSerializer(room).data)
    def delete(self, request, room_id):
        room = self.get_room(room_id)
        if room is None or room.owner_id != request.user.id:
            return Response({"detail": "Only the room owner can close it."}, status=403)
        async_to_sync(get_channel_layer().group_send)(f"room_{room.id}", {
            "type": "room.event", "payload": {"type": "room_closed"},
        })
        room.delete()
        return Response(status=204)

@api_view(["POST"])
def leave_room(request, room_id):
    Membership.objects.filter(room_id=room_id, user=request.user).delete()
    return Response(status=204)

@api_view(["DELETE"])
def remove_member(request, room_id, user_id):
    try:
        room = Room.objects.get(id=room_id)
    except Room.DoesNotExist:
        return Response({"detail": "Room not found."}, status=404)
    if room.owner_id != request.user.id:
        return Response({"detail": "Only the room owner can remove participants."}, status=403)
    if user_id == room.owner_id:
        return Response({"detail": "The room owner cannot be removed."}, status=400)
    removed = Membership.objects.filter(room=room, user_id=user_id).delete()[0]
    if not removed:
        return Response({"detail": "Participant not found in this room."}, status=404)
    async_to_sync(get_channel_layer().group_send)(f"room_{room.id}", {
        "type": "room.event",
        "payload": {"type": "member_removed", "user": {"id": user_id}},
    })
    return Response(status=204)

@api_view(["POST"])
def logout(request):
    request.user.auth_token.delete()
    return Response(status=204)
