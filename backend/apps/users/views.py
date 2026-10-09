from django.db import transaction
from rest_framework import viewsets, permissions, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Role, User, Employee
from .serializers import (
    RoleSerializer,
    UserSerializer,
    EmployeeSerializer,
    EmployeeDirectorySerializer,
)
from .permissions import IsSystemAdmin, IsHRManager, IsEmployee


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsSystemAdmin]
    lookup_field = 'public_id'

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('role').all()
    serializer_class = UserSerializer
    permission_classes = [IsSystemAdmin]
    lookup_field = 'public_id'

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()


class IsSystemAdminOrHRManager(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if request.user.role is None:
            return False
        return request.user.role.role_name in ['System Admin', 'HR Manager']


class EmployeeViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer
    lookup_field = 'public_id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Employee.objects.none()
        if user.is_superuser or (user.role and user.role.role_name in ['System Admin', 'HR Manager']):
            return Employee.objects.select_related(
                'user', 'user__role', 'department', 'manager__user'
            ).all()
        if user.role and user.role.role_name == 'Employee':
            return Employee.objects.select_related(
                'user', 'user__role', 'department', 'manager__user'
            )
        return Employee.objects.none()

    def get_serializer_class(self):
        user = self.request.user
        if (
            self.action in ['list', 'retrieve']
            and user.is_authenticated
            and user.role
            and user.role.role_name == 'Employee'
        ):
            return EmployeeDirectorySerializer
        return EmployeeSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsSystemAdminOrHRManager()]
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [IsSystemAdminOrHRManager()]

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()

    @action(detail=False, methods=['get'], url_path='me', permission_classes=[IsEmployee])
    def me(self, request):
        try:
            employee = Employee.objects.select_related('user', 'user__role').get(user=request.user)
        except Employee.DoesNotExist:
            return Response({'detail': 'Employee profile not found.'}, status=404)
        serializer = self.get_serializer(employee)
        return Response(serializer.data)