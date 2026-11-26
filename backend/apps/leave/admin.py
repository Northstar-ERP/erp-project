
from django.contrib import admin

from .models import LeaveType, LeavePolicy, LeaveRequest, LeaveBalance


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_paid", "is_active")
    search_fields = ("name",)
    list_filter = ("is_paid", "is_active")


@admin.register(LeavePolicy)
class LeavePolicyAdmin(admin.ModelAdmin):
    list_display = (
        "company",
        "leave_type",
        "year",
        "annual_allowance",
        "carry_forward_allowed",
        "requires_approval",
        "is_active",
    )
    list_filter = ("company", "year", "is_active")
    search_fields = ("company__name", "leave_type__name")


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "leave_type",
        "start_date",
        "end_date",
        "status",
        "reviewed_by",
    )
    list_filter = ("status", "leave_type", "start_date")
    search_fields = (
        "employee__first_name",
        "employee__last_name",
        "employee__user__username",
    )
    readonly_fields = ("created_at", "reviewed_at")


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "company",
        "leave_type",
        "year",
        "allocated",
        "used",
        "carried_forward",
    )
    list_filter = ("company", "year", "leave_type")
    search_fields = ("employee__first_name", "employee__last_name")
