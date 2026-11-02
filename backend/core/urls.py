from django.contrib import admin
from django.urls import path, include

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('apps.users.urls')),
    path('api/projects/', include('apps.projects.urls')),
    path('api/organization/', include('apps.organization.urls')),
    path('api/assets/', include('apps.assets.urls')),
    path('api/leave/', include('apps.leave.urls')),
    path('api/expense/', include('apps.expense.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
]