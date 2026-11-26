from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.utils.cache import CacheableModelMixin, MASTER_DATA_TTL
from apps.utils.throttling import WriteBurstThrottle
from apps.users.models import Employee
from apps.utils.views import AuditModelViewSet
from .models import Expense, ExpenseCategory
from .serializers import (
    ExpenseCategorySerializer,
    ExpenseSerializer,
)


class ExpenseCategoryPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        role_name = getattr(getattr(request.user, 'role', None), 'role_name', None)
        return request.user.is_superuser or role_name in {'System Admin', 'HR Manager'}


class ExpenseCategoryViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = ExpenseCategory.objects.select_related('created_by').order_by('name')
    serializer_class = ExpenseCategorySerializer
    permission_classes = [ExpenseCategoryPermission]
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']


class ExpenseViewSet(AuditModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [WriteBurstThrottle]

    def get_queryset(self):
        queryset = Expense.objects.select_related(
            'created_by',
            'employee',
            'employee__manager',
            'employee__department',
            'category',
            'approved_by',
        ).order_by('-submitted_at')

        user = self.request.user
        role_name = user.role.role_name if user.role else ''
        if user.is_superuser or role_name in {'System Admin', 'HR Manager'}:
            return queryset

        try:
            employee = user.employee_profile
        except (AttributeError, Employee.DoesNotExist):
            return queryset.none()

        if role_name == 'Department / Project Manager' or employee.subordinates.filter(is_deleted=False).exists():
            return queryset.filter(Q(employee=employee) | Q(employee__manager=employee))

        return queryset.filter(employee=employee)

    @transaction.atomic
    def perform_update(self, serializer):
        expense = Expense.objects.select_for_update().get(pk=serializer.instance.pk)
        if expense.employee.user_id != self.request.user.id:
            raise PermissionDenied('You can only edit your own expenses.')
        if expense.status != 'PENDING':
            raise ValidationError({
                'detail': 'Approved or rejected expenses are locked and cannot be edited.'
            })
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        expense = Expense.objects.select_for_update().get(pk=instance.pk)
        if expense.employee.user_id != self.request.user.id:
            raise PermissionDenied('You can only delete your own expenses.')
        if expense.status != 'PENDING':
            raise ValidationError({
                'detail': 'Approved or rejected expenses are locked and cannot be deleted.'
            })
        super().perform_destroy(expense)

    def _process_decision(self, request, new_status, require_comment=False):
        expense = Expense.objects.select_for_update().get(pk=self.get_object().pk)
        user = request.user
        role_name = user.role.role_name if user.role else ''
        is_hr_or_admin = user.is_superuser or role_name in {'System Admin', 'HR Manager'}
        actor_employee = getattr(user, 'employee_profile', None)
        is_direct_manager = bool(actor_employee and expense.employee.manager_id == actor_employee.id)

        if not (is_hr_or_admin or is_direct_manager):
            raise PermissionDenied('You do not have permission to approve or reject this expense.')

        if expense.employee.user_id == user.id:
            raise ValidationError({'detail': 'You cannot approve or reject your own expense.'})

        if expense.status != 'PENDING':
            raise ValidationError({
                'detail': f'Only PENDING expenses can be processed (current status: {expense.status}).'
            })

        comment = str(request.data.get('comment') or request.data.get('remarks') or '').strip()
        if require_comment and not comment:
            raise ValidationError({'comment': 'A comment is required when rejecting an expense.'})

        expense.status = new_status
        expense.approved_by = user
        expense.approved_at = timezone.now()
        if comment:
            expense.remarks = comment
        expense.save(update_fields=['status', 'approved_by', 'approved_at', 'remarks', 'updated_at'])
        return Response(self.get_serializer(expense).data)

    @action(detail=True, methods=['post'], url_path='approve')
    @transaction.atomic
    def approve(self, request, public_id=None):
        return self._process_decision(request, 'APPROVED', require_comment=False)

    @action(detail=True, methods=['post'], url_path='reject')
    @transaction.atomic
    def reject(self, request, public_id=None):
        return self._process_decision(request, 'REJECTED', require_comment=True)
