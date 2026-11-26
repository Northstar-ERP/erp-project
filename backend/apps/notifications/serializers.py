from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'public_id', 'notification_type', 'title', 'message', 'link',
            'related_public_id', 'is_read', 'read_at', 'created_at',
        ]
        read_only_fields = fields
