
from django.db.models.functions import TruncMonth
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.projects.models import Project, Task
from apps.users.models import Employee
from apps.organization.models import Department
from apps.assets.models import Asset
from apps.assets.models import AssetAllocation, AssetHistory

from django.db.models import Count, Sum
from apps.expense.models import Expense
from apps.leave.models import LeaveRequest, LeaveBalance


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    # Current totals
    totals = {
        "employees": Employee.objects.count(),
        "departments": Department.objects.count(),
        "projects": Project.objects.count(),
        "tasks": Task.objects.count(),
        "assets": Asset.objects.count(),
    }

    # Current status breakdowns
    projects_by_status = list(
        Project.objects.values("status")
        .annotate(total=Count("id"))
        .order_by("status")
    )

    tasks_by_status = list(
        Task.objects.values("status")
        .annotate(total=Count("id"))
        .order_by("status")
    )

    assets_by_status = list(
        Asset.objects.values("status")
        .annotate(total=Count("id"))
        .order_by("status")
    )

        # Expense analytics
    expenses = Expense.objects.all()

    expense_totals = {
        "count": expenses.count(),
        "amount": expenses.aggregate(total=Sum("amount"))["total"] or 0,
    }

    expenses_by_status = list(
        expenses.values("status")
        .annotate(total=Count("id"), amount=Sum("amount"))
        .order_by("status")
    )

    expenses_by_category = list(
        expenses.values("category__name")
        .annotate(total=Count("id"), amount=Sum("amount"))
        .order_by("category__name")
    )

    expenses_by_month = list(
        expenses.annotate(month=TruncMonth("expense_date"))
        .values("month")
        .annotate(total=Count("id"), amount=Sum("amount"))
        .order_by("month")
    )

    # Leave analytics
    leave_requests = LeaveRequest.objects.all()

    leave_totals = {
        "count": leave_requests.count(),
    }

    leaves_by_status = list(
        leave_requests.values("status")
        .annotate(total=Count("id"))
        .order_by("status")
    )

    leaves_by_type = list(
        leave_requests.values("leave_type__name")
        .annotate(total=Count("id"))
        .order_by("leave_type__name")
    )

    leaves_by_month = list(
        leave_requests.annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    leave_balances = list(
        LeaveBalance.objects.values("year")
        .annotate(
            allocated=Sum("allocated"),
            used=Sum("used"),
            carried_forward=Sum("carried_forward"),
        )
        .order_by("year")
    )

    # Month-wise project creation
    projects_by_month = list(
        Project.objects.annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    # Month-wise task creation
    tasks_by_month = list(
        Task.objects.annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    # Month-wise employee hiring
    employees_by_month = list(
        Employee.objects.exclude(hire_date__isnull=True)
        .annotate(month=TruncMonth("hire_date"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    # Month-wise asset purchases
    assets_by_month = list(
        Asset.objects.exclude(purchase_date__isnull=True)
        .annotate(month=TruncMonth("purchase_date"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    # Month-wise asset allocations
    allocations_by_month = list(
        AssetAllocation.objects.annotate(month=TruncMonth("allocation_date"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    # Month-wise asset history events
    asset_events_by_month = list(
        AssetHistory.objects.annotate(month=TruncMonth("event_date"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    return Response({
        "totals": totals,
        "projects_by_status": projects_by_status,
        "tasks_by_status": tasks_by_status,
        "assets_by_status": assets_by_status,
                "expense_totals": expense_totals,
        "expenses_by_status": expenses_by_status,
        "expenses_by_category": expenses_by_category,
        "leave_totals": leave_totals,
        "leaves_by_status": leaves_by_status,
        "leaves_by_type": leaves_by_type,
        "leave_balances": leave_balances,
        "monthly_analytics": {
            "projects_created": projects_by_month,
            "tasks_created": tasks_by_month,
            "employees_hired": employees_by_month,
            "assets_purchased": assets_by_month,
            "asset_allocations": allocations_by_month,
            "asset_history_events": asset_events_by_month,
                        "expenses_by_month": expenses_by_month,
            "leaves_by_month": leaves_by_month,
        },
    })
