from django.contrib import admin
from django.urls import include, path
from rooms.views import api_root, health

urlpatterns = [
    path("", api_root),
    path("admin/", admin.site.urls),
    path("api/", include("rooms.urls")),
    path("health/", health),
]
