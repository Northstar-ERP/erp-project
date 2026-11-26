from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models

from apps.utils.models import (
    AuditBaseModel,
    SoftDeleteQuerySet,
)


class Role(AuditBaseModel):
    # Django automatically generates an auto-incrementing primary key 'id' (role_id)
    role_name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    # Storing permissions as JSON allows flexible access control without complex join tables
    permissions = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.role_name

class UserManager(DjangoUserManager.from_queryset(SoftDeleteQuerySet)):
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class User(AuditBaseModel, AbstractUser):
    # AbstractUser already provides 'username', 'email', 'password', and 'is_active'
    # Here we map the remaining fields from the ERD
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, related_name='users')
    objects = UserManager()

    def __str__(self):
        return self.username

class Admin(AuditBaseModel):
    # Django auto-generates 'id' which serves as the admin_id
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='admin_profile')
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return f"Admin: {self.user.username}"


class Employee(AuditBaseModel):
    # Django auto-generates 'id' which serves as the employee_id
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='employee_profile')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    hire_date = models.DateField()
    employment_status = models.CharField(max_length=50, default='Active')
    job_title = models.CharField(max_length=200, blank=True, null=True)
    department = models.ForeignKey('organization.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='employees')
    manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')

    def __str__(self):
        return f"{self.first_name} {self.last_name}"