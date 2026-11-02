
from django.db import transaction

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.notifications.services import leave_submitted

from apps.utils.views import AuditModelViewSet
from .models import LeaveType, LeavePolicy, LeaveRequest, LeaveBalance
from .serializers import (
    LeaveTypeSerializer,
    LeavePolicySerializer,
    LeaveRequestSerializer,
    LeaveBalanceSerializer,
)
from .permissions import (
    IsHRAdminOrReadOnly,
    CanReviewLeave,
    get_employee,
    get_employee_company,
    is_hr_or_admin,
    is_manager,
)
from .services import approve_leave, reject_leave


class LeaveTypeViewSet(AuditModelViewSet):
    queryset = LeaveType.objects.select_related("created_by").all()
    serializer_class = LeaveTypeSerializer
    permission_classes = [IsHRAdminOrReadOnly]


class LeavePolicyViewSet(AuditModelViewSet):
    serializer_class = LeavePolicySerializer
    permission_classes = [IsHRAdminOrReadOnly]

    def get_queryset(self):
        queryset = LeavePolicy.objects.select_related(
            "created_by", "company", "leave_type"
        )

        if is_hr_or_admin(self.request.user):
            return queryset

        employee = get_employee(self.request.user)
        company = get_employee_company(employee)

        if not company:
            return queryset.none()

        return queryset.filter(company=company)


class LeaveRequestViewSet(AuditModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = LeaveRequest.objects.select_related(
            "created_by",
            "employee",
            "employee__user",
            "employee__manager",
            "leave_type",
            "reviewed_by",
        )

        if is_hr_or_admin(self.request.user):
            return queryset

        employee = get_employee(self.request.user)

        if not employee:
            return queryset.none()

        if is_manager(self.request.user):
            return queryset.filter(
                employee__manager=employee
            ) | queryset.filter(employee=employee)

        return queryset.filter(employee=employee)

    def perform_create(self, serializer):                    
        super().perform_create(serializer)
        leave_submitted(serializer.instance, actor=self.request.user)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[CanReviewLeave],
    )
    @transaction.atomic
    def approve(self, request, public_id=None):
        leave_request = self.get_object()

        updated_request = approve_leave(
            leave_request=leave_request,
            reviewer=request.user,
            comment=request.data.get("comment", ""),
        )

        return Response(
            self.get_serializer(updated_request).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[CanReviewLeave],
    )
    @transaction.atomic
    def reject(self, request, public_id=None):
        leave_request = self.get_object()

        updated_request = reject_leave(
            leave_request=leave_request,
            reviewer=request.user,
            comment=request.data.get("comment", ""),
        )

        return Response(
            self.get_serializer(updated_request).data,
            status=status.HTTP_200_OK,
        )


class LeaveBalanceViewSet(AuditModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        queryset = LeaveBalance.objects.select_related(
            "created_by",
            "employee",
            "company",
            "leave_type",
        )

        if is_hr_or_admin(self.request.user):
            return queryset

        employee = get_employee(self.request.user)

        if not employee:
            return queryset.none()

        return queryset.filter(employee=employee)
