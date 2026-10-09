from rest_framework import viewsets, permissions
from .models import Company, Branch, Department, Team
from .serializers import CompanySerializer, BranchSerializer, DepartmentSerializer, TeamSerializer
from apps.users.permissions import IsSystemAdminOrHRManager


class OrganizationAdminPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        return IsSystemAdminOrHRManager().has_permission(request, view)


class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [OrganizationAdminPermission]
    lookup_field = 'public_id'


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.select_related('company').all()
    serializer_class = BranchSerializer
    permission_classes = [OrganizationAdminPermission]
    lookup_field = 'public_id'


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.select_related('branch', 'branch__company').all()
    serializer_class = DepartmentSerializer
    permission_classes = [OrganizationAdminPermission]
    lookup_field = 'public_id'


class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.select_related('department', 'department__branch', 'department__branch__company').all()
    serializer_class = TeamSerializer
    permission_classes = [OrganizationAdminPermission]
    lookup_field = 'public_id'