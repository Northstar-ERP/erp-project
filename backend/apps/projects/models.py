from django.db import models, transaction
from django.utils import timezone
from apps.utils.models import AuditBaseModel


class Project(AuditBaseModel):
    class Status(models.TextChoices):
        PLANNING = 'Planning', 'Planning'
        ACTIVE = 'Active', 'Active'
        COMPLETED = 'Completed', 'Completed'
        ON_HOLD = 'On Hold', 'On Hold'

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    manager = models.ForeignKey(
        'users.Employee',
        on_delete=models.SET_NULL,
        null=True,
        related_name='managed_projects',
    )
    start_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PLANNING
    )
    deleted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name

    @transaction.atomic
    def delete(self, using=None, keep_parents=False):
        now = timezone.now()
        self.tasks.filter(is_deleted=False).update(
            is_deleted=True,
            deleted_at=now,
            updated_at=now,
        )
        super().delete(using=using, keep_parents=keep_parents)
        self.deleted_at = now
        type(self).all_objects.filter(pk=self.pk).update(deleted_at=now)

    @transaction.atomic
    def restore(self):
        now = timezone.now()
        if self.deleted_at is not None:
            Task.all_objects.filter(project=self, deleted_at=self.deleted_at).update(
                is_deleted=False,
                deleted_at=None,
                updated_at=now,
            )
        self.is_deleted = False
        self.deleted_at = None
        self.updated_at = now
        self.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])


class Task(AuditBaseModel):
    class Status(models.TextChoices):
        TODO = 'To Do', 'To Do'
        IN_PROGRESS = 'In Progress', 'In Progress'
        REVIEW = 'Review', 'Review'
        DONE = 'Done', 'Done'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    assigned_to = models.ForeignKey(
        'users.Employee',
        on_delete=models.SET_NULL,
        null=True,
        related_name='tasks',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    deadline = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.TODO
    )
    deleted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.project.name})"