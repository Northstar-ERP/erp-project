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

    class Meta:
        db_table = 'organization_branch'

    def __str__(self):
        return f"{self.name} ({self.company.name})"


class Department(AuditBaseModel):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='departments')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'organization_department'

    def __str__(self):
        return f"{self.name} ({self.branch.name})"


class Team(AuditBaseModel):
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='teams')
    name = models.CharField(max_length=200)

    class Meta:
        db_table = 'organization_team'

    def __str__(self):
        return f"{self.name} ({self.department.name})"