
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import AttendanceRecord


@transaction.atomic
def check_in(employee, user):
    now = timezone.now()
    work_date = timezone.localdate(now)

    # Lock an existing active record for this employee and day.
    record = (
        AttendanceRecord.objects
        .select_for_update()
        .filter(
            employee=employee,
            work_date=work_date,
            is_deleted=False,
        )
        .first()
    )

    if record:
        raise ValidationError(
            "You already have an attendance record for today."
        )

    return AttendanceRecord.objects.create(
        employee=employee,
        work_date=work_date,
        check_in=now,
        created_by=user,
        status=AttendanceRecord.Status.PRESENT,
    )


@transaction.atomic
def check_out(employee):
    work_date = timezone.localdate()

    record = (
        AttendanceRecord.objects
        .select_for_update()
        .filter(
            employee=employee,
            work_date=work_date,
            is_deleted=False,
        )
        .first()
    )

    if not record:
        raise ValidationError(
            "You must check in before checking out."
        )

    if not record.check_in:
        raise ValidationError(
            "This attendance record has no check-in time."
        )

    if record.check_out:
        raise ValidationError(
            "You have already checked out today."
        )

    record.check_out = timezone.now()
    record.save(update_fields=["check_out", "updated_at"])

    return record
