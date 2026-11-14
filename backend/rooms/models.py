import uuid
from django.conf import settings
from django.db import models

class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    avatar_url = models.URLField(blank=True, max_length=2048)

class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_rooms")
    is_public = models.BooleanField(default=False)
    is_locked = models.BooleanField(default=False)
    host_controls_only = models.BooleanField(default=False)
    voice_enabled = models.BooleanField(default=True)
    video_enabled = models.BooleanField(default=True)
    video_url = models.URLField(max_length=2048, blank=True)
    playback_position = models.FloatField(default=0)
    is_playing = models.BooleanField(default=False)
    playback_updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def current_position(self):
        if self.is_playing:
            from django.utils import timezone
            return max(0, self.playback_position + (timezone.now() - self.playback_updated_at).total_seconds())
        return self.playback_position

class Membership(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="room_memberships")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["room", "user"], name="unique_room_member")]

class ChatMessage(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="messages")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    text = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)
