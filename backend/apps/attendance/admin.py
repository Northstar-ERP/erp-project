
from django.contrib import admin

from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "employee",
        "work_date",
        "check_in",
        "check_out",
        "status",
        "is_deleted",
    )

    list_filter = (
        "status",
        "work_date",
        "is_deleted",
    )

    search_fields = (
        "employee__first_name",
        "employee__last_name",
        "employee__email",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )
