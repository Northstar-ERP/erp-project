from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """The logged-in user's own notifications. Nobody can see anyone else's:
    every query is filtered by recipient=request.user, so another user's
    public_id simply returns 404."""

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'public_id'

    def get_queryset(self):
        queryset = Notification.objects.filter(recipient=self.request.user)
        if self.action == 'list':
            is_read = self.request.query_params.get('is_read')
            if is_read is not None:
                queryset = queryset.filter(
                    is_read=is_read.lower() in ('1', 'true', 'yes')
                )
            notification_type = self.request.query_params.get('type')
            if notification_type:
                queryset = queryset.filter(notification_type=notification_type)
        return queryset

    # DELETE /<public_id>/ dismisses (soft deletes) the notification.

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        return Response({'count': self.get_queryset().filter(is_read=False).count()})

    @action(detail=True, methods=['post'])
    def read(self, request, public_id=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=['is_read', 'read_at', 'updated_at'])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        now = timezone.now()
        updated = self.get_queryset().filter(is_read=False).update(
            is_read=True, read_at=now, updated_at=now
        )
        return Response({'updated': updated})
