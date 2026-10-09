from django.db import transaction
from rest_framework import viewsets, permissions
from apps.users.permissions import IsSystemAdmin, IsProjectManager
from .models import Project, Task
from .serializers import ProjectSerializer, TaskSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    lookup_field = 'public_id'

    def get_queryset(self):
        user = self.request.user
        queryset = Project.objects.select_related(
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
                tasks__status__in=[
                    Task.Status.TODO,
                    Task.Status.IN_PROGRESS,
                    Task.Status.REVIEW,
                ],
            ).distinct()

        return queryset.none()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [permissions.IsAuthenticated, (IsSystemAdmin | IsProjectManager)]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [p() for p in permission_classes]

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()


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


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    lookup_field = 'public_id'
    permission_classes = [TaskPermission]

    def get_queryset(self):
        user = self.request.user
        queryset = Task.objects.select_related(
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

    @transaction.atomic
    def perform_create(self, serializer):
        # Only Project Managers and System Admins can create tasks
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        # Object-level permission already checked
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()