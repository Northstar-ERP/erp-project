
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import LeaveBalance, LeavePolicy, LeaveRequest
from .permissions import (
    get_employee_company,
    get_employee,
    is_hr_or_admin,
    is_manager,
)


def calculate_leave_days(start_date, end_date):
    if end_date < start_date:
        raise ValidationError(
            "End date cannot be before start date."
        )

    if start_date.year != end_date.year:
        raise ValidationError(
            "Leave requests cannot span multiple calendar years."
        )

    # Calendar days for now; weekends and holidays are included.
    return (end_date - start_date).days + 1


def can_review_leave(user, leave_request):
    if is_hr_or_admin(user):
        return True

    employee = get_employee(user)

    return bool(
        employee
        and is_manager(user)
        and leave_request.employee.manager_id == employee.pk
    )


@transaction.atomic
def approve_leave(leave_request, reviewer, comment=""):
    leave_request = (
        LeaveRequest.objects.select_for_update(of=("self",))
        .select_related(
            "employee__department__branch__company",
            "leave_type",
        )
        .get(pk=leave_request.pk)
    )

    if leave_request.status != LeaveRequest.Status.PENDING:
        raise ValidationError(
            "Only pending leave requests can be approved."
        )

    if not can_review_leave(reviewer, leave_request):
        raise ValidationError(
            "You are not authorized to approve this request."
        )

    if leave_request.employee.user_id == reviewer.pk:
        raise ValidationError(
            "You cannot approve your own leave request."
        )

    company = get_employee_company(leave_request.employee)

    if not company:
        raise ValidationError(
            "The employee is not linked to a company."
        )

    year = leave_request.start_date.year
    days = calculate_leave_days(
        leave_request.start_date,
        leave_request.end_date,
    )

    policy = LeavePolicy.objects.filter(
        company=company,
        leave_type=leave_request.leave_type,
        year=year,
        is_active=True,
    ).first()

    if not policy:
        raise ValidationError(
            "No active leave policy exists for this company and year."
        )

    if not leave_request.leave_type.is_active:
        raise ValidationError("This leave type is inactive.")

    if not policy.requires_approval:
        raise ValidationError(
            "This policy does not require approval."
        )

    balance, _ = LeaveBalance.objects.get_or_create(
        employee=leave_request.employee,
        company=company,
        leave_type=leave_request.leave_type,
        year=year,
        defaults={
            "allocated": policy.annual_allowance,
        },
    )

    balance = LeaveBalance.objects.select_for_update().get(
        pk=balance.pk
    )

    if balance.available < days:
        raise ValidationError(
            f"Insufficient leave balance. Available: "
            f"{balance.available}, requested: {days}."
        )

    balance.used += days
    balance.save(update_fields=["used"])

    leave_request.status = LeaveRequest.Status.APPROVED
    leave_request.reviewed_by = reviewer
    leave_request.reviewer_comment = comment
    leave_request.reviewed_at = timezone.now()
    leave_request.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewer_comment",
            "reviewed_at",
        ]
    )

    return leave_request


@transaction.atomic
def reject_leave(leave_request, reviewer, comment=""):
    leave_request = (
        LeaveRequest.objects.select_for_update()
        .get(pk=leave_request.pk)
    )

    if leave_request.status != LeaveRequest.Status.PENDING:
        raise ValidationError(
            "Only pending leave requests can be rejected."
        )

    if not can_review_leave(reviewer, leave_request):
        raise ValidationError(
            "You are not authorized to reject this request."
        )

    if leave_request.employee.user_id == reviewer.pk:
        raise ValidationError(
            "You cannot reject your own leave request."
        )

    leave_request.status = LeaveRequest.Status.REJECTED
    leave_request.reviewed_by = reviewer
    leave_request.reviewer_comment = comment
    leave_request.reviewed_at = timezone.now()
    leave_request.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewer_comment",
            "reviewed_at",
        ]
    )

    return leave_request
