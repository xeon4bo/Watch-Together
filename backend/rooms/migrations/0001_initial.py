import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="Room", fields=[
            ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ("name", models.CharField(max_length=100)), ("is_public", models.BooleanField(default=False)),
            ("is_locked", models.BooleanField(default=False)), ("host_controls_only", models.BooleanField(default=False)),
            ("voice_enabled", models.BooleanField(default=True)), ("video_enabled", models.BooleanField(default=True)),
            ("video_url", models.URLField(blank=True, max_length=2048)), ("playback_position", models.FloatField(default=0)),
            ("is_playing", models.BooleanField(default=False)), ("playback_updated_at", models.DateTimeField(auto_now=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)),
            ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="owned_rooms", to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name="Membership", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("joined_at", models.DateTimeField(auto_now_add=True)),
            ("room", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="rooms.room")),
            ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="room_memberships", to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name="ChatMessage", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("text", models.CharField(max_length=2000)), ("created_at", models.DateTimeField(auto_now_add=True)),
            ("room", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="messages", to="rooms.room")),
            ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.AddConstraint(model_name="membership", constraint=models.UniqueConstraint(fields=("room", "user"), name="unique_room_member")),
    ]
