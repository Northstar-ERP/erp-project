from .models import Company, Branch, Department, Team
from .serializers import CompanySerializer, BranchSerializer, DepartmentSerializer, TeamSerializer
from apps.utils.permissions import IsSystemAdminOrHRManager
from apps.utils.views import AuditModelViewSet
from apps.utils.cache import CacheableModelMixin, MASTER_DATA_TTL


class CompanyViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Company.objects.select_related('created_by').all()
    serializer_class = CompanySerializer
    permission_classes = [IsSystemAdminOrHRManager]
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']


class BranchViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Branch.objects.select_related('company', 'created_by').all()
    serializer_class = BranchSerializer
    permission_classes = [IsSystemAdminOrHRManager]
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']


class DepartmentViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Department.objects.select_related('branch', 'branch__company', 'created_by').all()
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