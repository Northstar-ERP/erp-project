from django.conf import settings
from django.db import models

from apps.utils.models import AuditBaseModel


class Notification(AuditBaseModel):
    """One in-app notification for one user.

    Inherits public_id, created_at, updated_at, is_deleted and created_by from
    AuditBaseModel. created_by is the person whose action triggered the
    notification (NULL for system events such as deadline reminders).
    Deleting a notification only hides it (soft delete).
    """

    class Type(models.TextChoices):
        LEAVE = 'leave', 'Leave'
        EXPENSE = 'expense', 'Expense'
        TASK = 'task', 'Task'
        DEADLINE = 'deadline', 'Deadline'
        PROJECT = 'project', 'Project'
        ASSET = 'asset', 'Asset'
        SYSTEM = 'system', 'System'

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    notification_type = models.CharField(
        max_length=20, choices=Type.choices, default=Type.SYSTEM
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    # Frontend route to open when the notification is clicked, e.g. '/leave'
    link = models.CharField(max_length=255, blank=True, default='')
    # public_id of the related leave request, task, project, ...
    related_public_id = models.UUIDField(null=True, blank=True)
    # Stops the same event notifying the same user twice (e.g. daily reminders)
    dedupe_key = models.CharField(max_length=120, blank=True, default='')
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(
                fields=['recipient', 'is_read', '-created_at'],
                name='notif_recipient_read_idx',
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['recipient', 'dedupe_key'],
                condition=~models.Q(dedupe_key=''),
                name='notif_unique_dedupe_per_user',
            ),
        ]

    def __str__(self):
        return f'{self.title} -> {self.recipient_id}'
