import logging
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from apps.utils.throttling import LoginRateThrottle
from .models import Role, User, Employee
from .serializers import (
    RoleSerializer,
    UserSerializer,
    EmployeeSerializer,
    EmployeeDirectorySerializer,
)
from .services import (
    send_invitation_email,
    verify_activation_token,
)
from apps.utils.permissions import (
    IsSystemAdmin,
    IsSystemAdminOrHRManager,
)
from apps.utils.views import AuditModelViewSet
from apps.utils.cache import CacheableModelMixin, MASTER_DATA_TTL

logger = logging.getLogger(__name__)


class LoginThrottledView(TokenObtainPairView):
    """Token obtain endpoint with strict login rate limiting."""
    throttle_classes = [LoginRateThrottle]


class RefreshThrottledView(TokenRefreshView):
    """Token refresh endpoint with strict login rate limiting."""
    throttle_classes = [LoginRateThrottle]


class RoleViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = Role.objects.select_related('created_by').all()
    serializer_class = RoleSerializer
    permission_classes = [IsSystemAdmin]
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']


class UserViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = User.objects.select_related('role', 'created_by').all()
    serializer_class = UserSerializer
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']

    def get_permissions(self):
        if self.action == 'create':
            return [IsSystemAdminOrHRManager()]
        return [IsSystemAdmin()]

    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user
        is_admin = user.is_superuser or (user.role and user.role.role_name == 'System Admin')
        if not is_admin:
            role = serializer.validated_data.get('role')
            if role and role.role_name != 'Employee':
                raise ValidationError({"role": "HR Managers are only authorized to provision users with the Employee role."})
        serializer.save()


class EmployeeViewSet(AuditModelViewSet):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Employee.objects.none()

        base_qs = Employee.objects.select_related(
            'user', 'user__role', 'department', 'department__branch', 'department__branch__company',
            'manager', 'manager__user', 'created_by'
        ).prefetch_related(
            'managed_branches', 'headed_departments', 'subordinates'
        )

        if user.is_superuser or (
            user.role and user.role.role_name in ['System Admin', 'HR Manager']
        ):
            return base_qs.all()

        if user.role and user.role.role_name in ['Department / Project Manager', 'Employee']:
            return base_qs.all()

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
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [IsSystemAdminOrHRManager()]

    @action(detail=False, methods=['get'], url_path='me', permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        try:
            employee = Employee.objects.select_related(
                'user', 'user__role', 'department', 'manager__user'
            ).get(user=request.user)
        except Employee.DoesNotExist:
            if request.user.is_superuser:
                return Response({
                    'public_id': str(request.user.public_id),
                    'user': {
                        'public_id': str(request.user.public_id),
                        'username': request.user.username,
                        'email': request.user.email,
                        'role': {'role_name': 'System Admin'},
                    },
                    'first_name': 'System',
                    'last_name': 'Admin',
                    'email': request.user.email,
                    'phone': '',
                    'hire_date': request.user.date_joined.date() if request.user.date_joined else None,
                    'employment_status': 'Active',
                    'job_title': 'System Administrator',
                    'department': None,
                    'manager': None,
                })
            return Response({'detail': 'Employee profile not found.'}, status=404)
        serializer = self.get_serializer(employee)
        return Response(serializer.data)


class InviteEmployeeView(APIView):
    """
    Generate a cryptographic single-use activation link and dispatch an official
    invitation email to the employee's registered email address.
    """
    permission_classes = [IsSystemAdminOrHRManager]

    @transaction.atomic
    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        employee_id = request.data.get('employee_id')

        if not email and not employee_id:
            return Response(
                {'detail': 'An employee official email or employee ID is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee = None
        if employee_id:
            try:
                employee = Employee.objects.select_related('user').get(public_id=employee_id, is_deleted=False)
            except (Employee.DoesNotExist, ValueError):
                return Response({'detail': 'Employee record not found.'}, status=status.HTTP_404_NOT_FOUND)
        elif email:
            employee = (
                Employee.objects.select_related('user')
                .filter(email__iexact=email, is_deleted=False)
                .first()
            )
            if not employee:
                employee = (
                    Employee.objects.select_related('user')
                    .filter(user__email__iexact=email, is_deleted=False)
                    .first()
                )

        if not employee or not employee.user:
            return Response(
                {'detail': f'No employee profile or linked login account found for {email or employee_id}.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = employee.user
        if user.is_active and employee.employment_status.lower() == 'active':
            return Response(
                {'detail': f'Account for {employee.first_name} {employee.last_name} is already active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            activation_url = send_invitation_email(employee, user)
        except Exception as exc:
            logger.exception("Failed to dispatch activation email: %s", exc)
            return Response(
                {'detail': f'Email delivery error: {str(exc)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                'message': f'Activation email successfully dispatched to {employee.email or user.email}.',
                'email': employee.email or user.email,
                'employee_name': f'{employee.first_name} {employee.last_name}',
                'activation_url': activation_url,
            },
            status=status.HTTP_200_OK,
        )


class AccountActivationView(APIView):
    """
    Public onboarding endpoints for validating invitation tokens and activating
    employee accounts with their chosen password.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        token = request.query_params.get('token', '').strip()
        if not token:
            return Response(
                {'valid': False, 'detail': 'Missing activation token in query parameter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user, employee = verify_activation_token(token)
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict) and 'token' in detail:
                msg = detail['token']
                if isinstance(msg, list):
                    msg = msg[0]
            else:
                msg = str(detail)
            return Response({'valid': False, 'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'valid': True,
                'employee_name': f'{employee.first_name} {employee.last_name}' if employee else user.username,
                'email': employee.email if employee else user.email,
                'username': user.username,
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def post(self, request):
        token = request.data.get('token', '').strip()
        password = request.data.get('password', '')
        password_confirm = request.data.get('password_confirm', '')

        if not token:
            return Response({'detail': 'Activation token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not password:
            return Response({'detail': 'A new password is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if password_confirm and password != password_confirm:
            return Response({'detail': 'Password confirmation does not match.'}, status=status.HTTP_400_BAD_REQUEST)

        user, employee = verify_activation_token(token)

        try:
            django_validate_password(password, user=user)
        except DjangoValidationError as exc:
            return Response({'detail': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        # Activate user account and set password
        user.set_password(password)
        user.is_active = True
        user.save(update_fields=['password', 'is_active', 'updated_at'])

        # Update employee status to Active
        if employee:
            employee.employment_status = 'Active'
            employee.save(update_fields=['employment_status', 'updated_at'])

        return Response(
            {
                'message': 'Account successfully activated! You may now sign in with your corporate credentials.',
                'username': user.username,
            },
            status=status.HTTP_200_OK,
        )
