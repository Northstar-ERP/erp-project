import uuid
from django.db import models


class Project(models.Model):
    class Status(models.TextChoices):
        PLANNING = 'Planning', 'Planning'
        ACTIVE = 'Active', 'Active'
        COMPLETED = 'Completed', 'Completed'
        ON_HOLD = 'On Hold', 'On Hold'

    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    manager = models.ForeignKey(
    'users.Employee',
    on_delete=models.SET_NULL,
    null=True,
    related_name='managed_projects'
)
    start_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PLANNING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Task(models.Model):
    class Status(models.TextChoices):
        TODO = 'To Do', 'To Do'
        IN_PROGRESS = 'In Progress', 'In Progress'
        REVIEW = 'Review', 'Review'
        DONE = 'Done', 'Done'

    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    assigned_to = models.ForeignKey(
    'users.Employee',
    on_delete=models.SET_NULL,
    null=True,
    related_name='tasks'
)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    deadline = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.TODO
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.project.name})"