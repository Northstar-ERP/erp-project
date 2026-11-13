from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.core.exceptions import ValidationError
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
    employee_code = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    hire_date = models.DateField()
    employment_status = models.CharField(max_length=50, default='Active')
    resignation_date = models.DateField(null=True, blank=True)
    job_title = models.CharField(max_length=200, blank=True, null=True)
    department = models.ForeignKey('organization.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='employees')
    manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')

    # Employment statuses that mark a departure and therefore require a resignation_date.
    SEPARATION_STATUSES = {'resigned', 'terminated'}

    @property
    def branch(self):
        return self.department.branch if self.department else None

    @property
    def company(self):
        return self.department.branch.company if self.department and self.department.branch else None

    def clean(self):
        super().clean()
        if self.employment_status == 'Active' and not self.department_id:
            raise ValidationError({'department': 'Department is required for active employees.'})
        if self.manager_id:
            if self.manager_id == self.id:
                raise ValidationError({'manager': 'An employee cannot be their own manager.'})
            if not self.company or not self.manager.company or self.company.id != self.manager.company.id:
                raise ValidationError({'manager': 'An employee’s manager must belong to the same company.'})
            # Walk the full reporting chain (any depth) to catch indirect cycles,
            # e.g. A -> B -> C -> A, not just a direct self-reference.
            current = self.manager
            visited = set()
            while current:
                if current.id == self.id:
                    raise ValidationError({'manager': 'Circular manager reference detected.'})
                if current.id in visited:
                    break
                visited.add(current.id)
                current = current.manager

        status_key = (self.employment_status or '').lower()
        if status_key in self.SEPARATION_STATUSES:
            if not self.resignation_date:
                raise ValidationError({
                    'resignation_date': 'Resignation date is required when employment status is Resigned or Terminated.'
                })
            # Block the transition while this employee still has direct reports —
            # those need a new manager assigned before this one can leave.
            if self.pk and self.subordinates.filter(is_deleted=False).exists():
                raise ValidationError({
                    'employment_status': "Reassign this employee's direct reports to another manager first."
                })
        elif status_key == 'active':
            # Resigning/terminating is reversible (e.g. rehire); clear any stale date.
            self.resignation_date = None

        if self.resignation_date and self.hire_date and self.resignation_date < self.hire_date:
            raise ValidationError({'resignation_date': 'Resignation date cannot be before the hire date.'})

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.employee_code:
            self.employee_code = f"EMP-{self.id:04d}"
            super().save(update_fields=['employee_code', 'updated_at'])

    def delete(self, using=None, keep_parents=False):
        # Soft-delete never fires the DB-level on_delete=SET_NULL for Branch.manager /
        # Department.head, so a deactivated employee would otherwise keep being
        # reported as a branch manager / department head. Clear those links first.
        self.managed_branches.filter(is_deleted=False).update(manager=None)
        self.headed_departments.filter(is_deleted=False).update(head=None)
        super().delete(using=using, keep_parents=keep_parents)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"