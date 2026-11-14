from django.contrib.auth.models import User
from rest_framework import serializers
from .models import ChatMessage, Membership, Room, UserProfile

def get_avatar_url(user):
    try:
        return user.profile.avatar_url or None
    except UserProfile.DoesNotExist:
        return None

class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "avatar_url"]

    def get_avatar_url(self, user):
        return get_avatar_url(user)

class ChatMessageSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username")
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = ["id", "username", "avatar_url", "text", "created_at"]

    def get_avatar_url(self, message):
        return get_avatar_url(message.user)

class AvatarUploadSerializer(serializers.Serializer):
    avatar = serializers.ImageField()

    def validate_avatar(self, image):
        if image.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Choose an image smaller than 5 MB.")
        return image

class RoomSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.username", read_only=True)
    members = serializers.SerializerMethodField()
    position = serializers.FloatField(source="current_position", read_only=True)
    class Meta:
        model = Room
        fields = [
            "id", "name", "owner_id", "owner_name", "is_public", "is_locked",
            "host_controls_only", "voice_enabled", "video_enabled", "video_url",
            "playback_position", "position", "is_playing", "playback_updated_at",
            "created_at", "members",
        ]
        read_only_fields = ["owner_id", "playback_position", "is_playing", "playback_updated_at", "created_at"]

    def get_members(self, room):
        users = User.objects.filter(room_memberships__room=room).distinct()
        return UserSerializer(users, many=True).data
