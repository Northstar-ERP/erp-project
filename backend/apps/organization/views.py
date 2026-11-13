from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.users.models import Employee
from .models import Company, Branch, Department, Team
from .serializers import CompanySerializer, BranchSerializer, DepartmentSerializer, TeamSerializer
from apps.utils.permissions import IsSystemAdmin, IsSystemAdminOrHRManager
from apps.utils.views import AuditModelViewSet
from apps.utils.cache import CacheableModelMixin, MASTER_DATA_TTL


class CompanyViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Company.objects.select_related('created_by').all()
    serializer_class = CompanySerializer
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']

    def get_permissions(self):
        # Creating/renaming/deleting legal entities is a System Admin action;
        # HR Managers may only read the list to assign employees into it.
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsSystemAdmin()]
        return [IsSystemAdminOrHRManager()]

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


class BranchViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Branch.objects.select_related('company', 'manager', 'manager__user', 'created_by').all()
    serializer_class = BranchSerializer
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']

    def get_permissions(self):
        # Opening/closing branches restructures the company; restrict to System Admin.
        # Day-to-day branch-manager reassignment also lives here, so HR still needs
        # read access to populate pickers, just not create/update/destroy.
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsSystemAdmin()]
        return [IsSystemAdminOrHRManager()]


class DepartmentViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Department.objects.select_related(
        'branch', 'branch__company', 'head', 'head__user', 'created_by'
    ).all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsSystemAdminOrHRManager]
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']


class TeamViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Team.objects.select_related(
        'department', 'department__branch', 'department__branch__company', 'created_by'
    ).all()
    serializer_class = TeamSerializer
    permission_classes = [IsSystemAdminOrHRManager]
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']