from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['title', 'recipient', 'notification_type', 'is_read',
                    'created_at', 'is_deleted']
    list_filter = ['notification_type', 'is_read', 'is_deleted']
    search_fields = ['title', 'message', 'recipient__username']
    readonly_fields = ['public_id', 'created_at', 'updated_at']

    def get_queryset(self, request):
        # include soft-deleted rows so they can be inspected
        return self.model.all_objects.all()
