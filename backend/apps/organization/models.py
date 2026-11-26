from django.core.exceptions import ValidationError
from django.db import models

from apps.utils.models import AuditBaseModel


class Company(AuditBaseModel):
    name = models.CharField(max_length=200)
    registration_number = models.CharField(max_length=100, unique=True)
    address = models.TextField()
    contact_email = models.EmailField()
    creation_reason = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'organization_company'

    def __str__(self):
        return self.name


class Branch(AuditBaseModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='branches')
    name = models.CharField(max_length=200)
    location = models.TextField()
    contact_phone = models.CharField(max_length=20, blank=True, null=True)
    creation_reason = models.TextField(blank=True, null=True)
    manager = models.ForeignKey(
        'users.Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_branches',
    )

    class Meta:
        db_table = 'organization_branch'

    def clean(self):
        super().clean()
        if self.manager_id:
            emp = self.manager
            if not emp.department_id or emp.department.branch_id != self.id:
                raise ValidationError({'manager': 'Branch manager must work in this branch.'})

    def __str__(self):
        return f"{self.name} ({self.company.name})"


class Department(AuditBaseModel):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='departments')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    head = models.ForeignKey(
        'users.Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='headed_departments',
    )

    class Meta:
        db_table = 'organization_department'

    def clean(self):
        super().clean()
        if self.head_id:
            if self.head.department_id != self.id:
                raise ValidationError({'head': 'Department head must belong to this department.'})

    def __str__(self):
        return f"{self.name} ({self.branch.name})"


class Team(AuditBaseModel):
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='teams')
    name = models.CharField(max_length=200)

    class Meta:
        db_table = 'organization_team'

    def __str__(self):
        return f"{self.name} ({self.department.name})"