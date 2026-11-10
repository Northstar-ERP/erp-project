
from django.conf import settings
from django.db import models
from django.db.models import Q

from users.models import Employee


class AttendanceRecord(models.Model):
    """Stores an employee's daily attendance."""

    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        LATE = "LATE", "Late"
        HALF_DAY = "HALF_DAY", "Half Day"
        ABSENT = "ABSENT", "Absent"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="attendance_records",
    )

    work_date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PRESENT,
    )

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_records_created",
    )

    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-work_date", "-check_in"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "work_date"],
                condition=Q(is_deleted=False),
                name="unique_active_employee_attendance_day",
            ),
            models.CheckConstraint(
                condition=(
                    Q(check_in__isnull=True)
                    | Q(check_out__isnull=True)
                    | Q(check_out__gte=models.F("check_in"))
                ),
                name="attendance_checkout_after_checkin",
            ),
        ]

    @property
    def worked_minutes(self):
        """Return completed work duration in minutes."""
        if not self.check_in or not self.check_out:
            return None

        duration = self.check_out - self.check_in
        return max(0, int(duration.total_seconds() // 60))

    def __str__(self):
        return f"{self.employee} - {self.work_date}"
