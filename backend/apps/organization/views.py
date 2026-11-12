from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.users.models import Employee
from .models import Company, Branch, Department, Team
from .serializers import CompanySerializer, BranchSerializer, DepartmentSerializer, TeamSerializer
from apps.utils.permissions import IsSystemAdminOrHRManager
from apps.utils.views import AuditModelViewSet


class CompanyViewSet(AuditModelViewSet):
    queryset = Company.objects.select_related('created_by').all()
    serializer_class = CompanySerializer
    permission_classes = [IsSystemAdminOrHRManager]

    @transaction.atomic
    def perform_destroy(self, instance):
        if Employee.objects.filter(
            department__branch__company=instance,
            is_deleted=False,
        ).exists():
            raise ValidationError({
                'detail': (
                    f"Cannot delete organization '{instance.name}' while it still has assigned "
                    "employees. Please reassign or remove employees first."
                )
            })

        Team.objects.filter(department__branch__company=instance).delete()
        Department.objects.filter(branch__company=instance).delete()
        Branch.objects.filter(company=instance).delete()
        super().perform_destroy(instance)


class BranchViewSet(AuditModelViewSet):
    queryset = Branch.objects.select_related('company', 'manager', 'manager__user', 'created_by').all()
    serializer_class = BranchSerializer
    permission_classes = [IsSystemAdminOrHRManager]


class DepartmentViewSet(AuditModelViewSet):
    queryset = Department.objects.select_related(
        'branch', 'branch__company', 'head', 'head__user', 'created_by'
    ).all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsSystemAdminOrHRManager]


class TeamViewSet(AuditModelViewSet):
    queryset = Team.objects.select_related(
        'department', 'department__branch', 'department__branch__company', 'created_by'
    ).all()
    serializer_class = TeamSerializer
    permission_classes = [IsSystemAdminOrHRManager]