from django.urls import path
from .views import AvatarView, LoginView, MeView, RegisterView, RoomDetailView, RoomListCreateView, leave_room, logout, remove_member

urlpatterns = [
    path("auth/register/", RegisterView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/logout/", logout),
    path("auth/me/", MeView.as_view()),
    path("auth/me/avatar/", AvatarView.as_view()),
    path("rooms/", RoomListCreateView.as_view()),
    path("rooms/<uuid:room_id>/", RoomDetailView.as_view()),
    path("rooms/<uuid:room_id>/leave/", leave_room),
    path("rooms/<uuid:room_id>/members/<int:user_id>/", remove_member),
]
