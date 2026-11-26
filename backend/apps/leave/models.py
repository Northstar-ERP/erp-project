
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.organization.models import Company
from apps.users.models import Employee
from apps.utils.models import AuditBaseModel


class LeaveType(AuditBaseModel):
    """Defines the types of leave available in the ERP."""

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_paid = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class LeavePolicy(AuditBaseModel):
    """Defines a company's annual allowance for a leave type."""

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="leave_policies",
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.PROTECT,
        related_name="policies",
    )
    year = models.PositiveIntegerField()
    annual_allowance = models.PositiveIntegerField(default=0)
    carry_forward_allowed = models.BooleanField(default=False)
    max_carry_forward = models.PositiveIntegerField(default=0)
    requires_approval = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta(AuditBaseModel.Meta):
        abstract = False
        constraints = [
            models.UniqueConstraint(
                fields=["company", "leave_type", "year"],
                name="unique_company_leave_policy_year",
            ),
        ]

    def __str__(self):
        return (
            f"{self.company.name} - {self.leave_type.name} "
            f"- {self.year}"
        )


class LeaveRequest(AuditBaseModel):
    """Stores leave applications submitted by employees."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="leave_requests",
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.PROTECT,
        related_name="leave_requests",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_leave_requests",
    )
    reviewer_comment = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta(AuditBaseModel.Meta):
        abstract = False
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F("start_date")),
                name="leave_request_valid_date_range",
            ),
        ]

    def __str__(self):
        return (
            f"{self.employee} - {self.leave_type.name} "
            f"({self.start_date} to {self.end_date})"
        )


class LeaveBalance(AuditBaseModel):
    """Tracks an employee's leave allowance and usage."""

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="leave_balances",
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="leave_balances",
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.PROTECT,
        related_name="balances",
    )
    year = models.PositiveIntegerField()
    allocated = models.PositiveIntegerField(default=0)
    used = models.PositiveIntegerField(default=0)
    carried_forward = models.PositiveIntegerField(default=0)

    class Meta(AuditBaseModel.Meta):
        abstract = False
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "employee",
                    "company",
                    "leave_type",
                    "year",
                ],
                name="unique_employee_company_leave_balance",
            ),
        ]

    @property
    def available(self):
        return (
            self.allocated
            + self.carried_forward
            - self.used
        )

    def __str__(self):
        return (
            f"{self.employee} - {self.leave_type.name} "
            f"- {self.year}"
        )
