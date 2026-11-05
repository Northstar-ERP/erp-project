from django.db import transaction
from rest_framework import permissions
from apps.utils.permissions import IsProjectManager, IsSystemAdmin
from apps.utils.views import AuditModelViewSet
from apps.utils.throttling import WriteBurstThrottle
from .models import Project, Task
from .serializers import ProjectSerializer, TaskSerializer
from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.response import Response


class ProjectViewSet(AuditModelViewSet):
    serializer_class = ProjectSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Project.objects.select_related(
            'created_by',
            'manager',
            'manager__user',
            'manager__user__role',
            'manager__department',
        ).order_by('-created_at')

        if not user.is_authenticated:
            return queryset.none()

        role_name = getattr(getattr(user, 'role', None), 'role_name', None)
        if user.is_superuser or role_name in [
            'System Admin',
            'Department / Project Manager',
        ]:
            return queryset

        if role_name == 'Employee':
            return queryset.filter(
                tasks__assigned_to__user=user,
                tasks__is_deleted=False,          # <-- new
                tasks__status__in=[
                    Task.Status.TODO,
                    Task.Status.IN_PROGRESS,
                    Task.Status.REVIEW,
                ],
            ).distinct()

        return queryset.none()

    def get_permissions(self):
        if self.action in ['trash', 'restore']:
            permission_classes = [permissions.IsAuthenticated, IsSystemAdmin]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [permissions.IsAuthenticated, (IsSystemAdmin | IsProjectManager)]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [p() for p in permission_classes]

    @action(detail=False, methods=['get'])
    def trash(self, request):
        qs = Project.all_objects.filter(is_deleted=True).select_related(
            'created_by', 'manager', 'manager__user', 'manager__user__role',
            'manager__department',
        ).order_by('-deleted_at')
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def restore(self, request, public_id=None):
        project = get_object_or_404(Project.all_objects, public_id=public_id, is_deleted=True)
        with transaction.atomic():
            project.restore()
        return Response(self.get_serializer(project).data)


class TaskPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if request.user.role is None:
            return False

        role_name = request.user.role.role_name

        if role_name in ['System Admin', 'Department / Project Manager']:
            return True

        if role_name == 'Employee':
            if request.method in permissions.SAFE_METHODS:
                return True
            if request.method == 'PATCH':
                return True
            return False

        return False

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True

        if request.user.role is None:
            return False

        role_name = request.user.role.role_name

        if role_name in ['System Admin', 'Department / Project Manager']:
            return True

        if role_name == 'Employee':
            if request.method in permissions.SAFE_METHODS:
                return obj.assigned_to and obj.assigned_to.user == request.user
            if request.method in ['PUT', 'PATCH']:
                if obj.assigned_to and obj.assigned_to.user == request.user:
                    request_fields = set(request.data.keys())
                    return request_fields == {'status'}
                return False

        return False


class TaskViewSet(AuditModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [TaskPermission]
    throttle_classes = [WriteBurstThrottle]

    def get_queryset(self):
        user = self.request.user
        queryset = Task.objects.select_related(
            'created_by',
            'project',
            'assigned_to',
            'assigned_to__user',
            'assigned_to__user__role',
            'assigned_to__department',
        ).order_by('-created_at')

        if user.is_superuser or (
            user.role and
            user.role.role_name in ['System Admin', 'Department / Project Manager']
        ):
            return queryset

        if (
            user.role
            and user.role.role_name == 'Employee'
            and hasattr(user, 'employee_profile')
        ):
            return queryset.filter(assigned_to=user.employee_profile)

        return queryset.none()
