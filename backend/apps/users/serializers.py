from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.db import transaction
from .models import Role, User, Employee
from apps.organization.models import Department
from apps.utils.turnstile import verify_turnstile_token

_UNSET = object()

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    turnstile_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims to the JWT payload
        token['username'] = user.username
        token['role'] = user.role.role_name if user.role else None

        return token

    def validate(self, attrs):
        token = attrs.pop('turnstile_token', '')
        request = self.context.get('request')
        remote_ip = request.META.get('REMOTE_ADDR') if request else None

        if not verify_turnstile_token(token, remote_ip):
            raise serializers.ValidationError(
                {'turnstile_token': 'Human verification failed. Please try again.'}
            )

        return super().validate(attrs)


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['public_id', 'role_name', 'description', 'permissions']


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Role.objects.all(),
        allow_null=True,
        required=False
    )
    role_name = serializers.CharField(
        source='role.role_name',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = ['public_id', 'username', 'email', 'role', 'role_name', 'is_active', 'password']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

    def validate_password(self, value):
        django_validate_password(value, user=self.instance)
        return value

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password is not None:
            instance.set_password(password)
        instance.save()
        return instance


class EmployeeDirectorySerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(
        source='user.role.role_name',
        read_only=True,
        allow_null=True,
    )
    department_name = serializers.CharField(
        source='department.name',
        read_only=True,
        allow_null=True,
    )
    branch_name = serializers.CharField(
        source='department.branch.name',
        read_only=True,
        allow_null=True,
    )
    company_name = serializers.CharField(
        source='department.branch.company.name',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Employee
        fields = [
            'public_id',
            'employee_code',
            'first_name',
            'last_name',
            'job_title',
            'role_name',
            'department_name',
            'branch_name',
            'company_name',
        ]


class EmployeeSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)
    role_name = serializers.CharField(
        source='user.role.role_name',
        read_only=True,
        allow_null=True,
    )
    department_name = serializers.CharField(
        source='department.name',
        read_only=True,
        allow_null=True,
    )
    branch = serializers.SlugRelatedField(
        source='department.branch',
        slug_field='public_id',
        read_only=True,
        allow_null=True,
    )
    branch_name = serializers.CharField(
        source='department.branch.name',
        read_only=True,
        allow_null=True,
    )
    company = serializers.SlugRelatedField(
        source='department.branch.company',
        slug_field='public_id',
        read_only=True,
        allow_null=True,
    )
    company_name = serializers.CharField(
        source='department.branch.company.name',
        read_only=True,
        allow_null=True,
    )
    manager_name = serializers.SerializerMethodField(read_only=True)
    is_manager = serializers.SerializerMethodField(read_only=True)
    is_branch_manager = serializers.SerializerMethodField(read_only=True)
    is_department_head = serializers.SerializerMethodField(read_only=True)
    subordinates_count = serializers.SerializerMethodField(read_only=True)

    user = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False)
    role = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Role.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    is_active = serializers.BooleanField(write_only=True, required=False, default=True)
    make_branch_manager = serializers.BooleanField(write_only=True, required=False)
    make_department_head = serializers.BooleanField(write_only=True, required=False)

    department = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Department.objects.all(),
        allow_null=False,
        required=True,
    )
    manager = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Employee.objects.all(),
        allow_null=True,
        required=False
    )

    class Meta:
        model = Employee
        fields = [
            'public_id', 'employee_code', 'user', 'user_details', 'role_name',
            'username', 'password', 'role', 'is_active',
            'make_branch_manager', 'make_department_head',
            'first_name', 'last_name',
            'email', 'phone', 'hire_date', 'employment_status', 'resignation_date',
            'job_title', 'department', 'department_name',
            'branch', 'branch_name', 'company', 'company_name',
            'manager', 'manager_name',
            'is_manager', 'is_branch_manager', 'is_department_head', 'subordinates_count'
        ]

    def get_manager_name(self, obj):
        if obj.manager:
            return f"{obj.manager.first_name} {obj.manager.last_name}".strip()
        return None

    def get_is_branch_manager(self, obj):
        return obj.managed_branches.filter(is_deleted=False).exists()

    def get_is_department_head(self, obj):
        return obj.headed_departments.filter(is_deleted=False).exists()

    def get_subordinates_count(self, obj):
        return obj.subordinates.filter(is_deleted=False).count()

    def get_is_manager(self, obj):
        role_name = obj.user.role.role_name if obj.user and obj.user.role else ''
        if role_name in ['Department / Project Manager', 'HR Manager', 'System Admin'] or 'manager' in role_name.lower():
            return True
        if obj.managed_branches.filter(is_deleted=False).exists():
            return True
        if obj.headed_departments.filter(is_deleted=False).exists():
            return True
        if obj.subordinates.filter(is_deleted=False).exists():
            return True
        return False

    def validate_manager(self, value):
        if self.instance and value and value.public_id == self.instance.public_id:
            raise serializers.ValidationError("An employee cannot be their own manager.")
        return value

    def validate(self, attrs):
        status_val = attrs.get('employment_status', self.instance.employment_status if self.instance else 'Active')
        department = attrs.get('department', self.instance.department if self.instance else None)

        # Department is required for new employees, active employees, and explicit updates
        if (self.instance is None or 'department' in attrs or status_val.lower() == 'active') and not department:
            raise serializers.ValidationError({
                "department": "Department is required."
            })

        # Atomic user creation validation when creating employee without existing user UUID
        if self.instance is None and not attrs.get('user'):
            username = (attrs.get('username') or '').strip()
            password = attrs.get('password') or ''
            role = attrs.get('role')
            is_active = attrs.get('is_active', True)
            email = attrs.get('email', '')

            errors = {}
            if not username:
                errors['username'] = 'Login username is required.'
            if not password:
                errors['password'] = 'Initial password is required.'
            if errors:
                raise serializers.ValidationError(errors)

            request = self.context.get('request')
            req_user = getattr(request, 'user', None)
            if req_user and req_user.is_authenticated:
                is_admin = req_user.is_superuser or (
                    req_user.role and req_user.role.role_name == 'System Admin'
                )
                if not is_admin:
                    if role and role.role_name != 'Employee':
                        raise serializers.ValidationError({
                            'role': 'HR Managers are only authorized to provision users with the Employee role.'
                        })
                    if role is None:
                        role = Role.objects.filter(role_name='Employee').first()
                        attrs['role'] = role

            user_payload = {
                'username': username,
                'email': email,
                'password': password,
                'role': role.public_id if role else None,
                'is_active': is_active,
            }
            user_serializer = UserSerializer(data=user_payload)
            user_serializer.is_valid(raise_exception=True)

        manager = attrs.get('manager', self.instance.manager if self.instance else None)
        instance = self.instance

        if manager and instance:
            # Check for circular reference: traverse up the manager chain
            current = manager
            visited = set()
            while current:
                if current.public_id == instance.public_id:
                    raise serializers.ValidationError({
                        "manager": "Circular manager reference detected."
                    })
                if current.public_id in visited:
                    break
                visited.add(current.public_id)
                current = current.manager

        # An employee's manager must be in the same company
        if manager:
            emp_company_id = department.branch.company_id if department and department.branch_id else None
            mgr_company_id = (
                manager.department.branch.company_id
                if manager.department and manager.department.branch_id
                else None
            )
            if not emp_company_id or not mgr_company_id or emp_company_id != mgr_company_id:
                raise serializers.ValidationError({
                    "manager": "An employee’s manager must belong to the same company."
                })

        # Ensure moving department doesn't violate branch manager, department head, or subordinate company rules
        if instance and department:
            has_dh_flag = 'make_department_head' in attrs
            if not has_dh_flag:
                headed_depts = list(instance.headed_departments.filter(is_deleted=False))
                for hd in headed_depts:
                    if hd.id != department.id:
                        raise serializers.ValidationError({
                            "department": f"This employee is the Head of department '{hd.name}' and must remain in that department."
                        })

            has_bm_flag = 'make_branch_manager' in attrs
            if not has_bm_flag:
                managed_brs = list(instance.managed_branches.filter(is_deleted=False))
                for mb in managed_brs:
                    if department.branch_id != mb.id:
                        raise serializers.ValidationError({
                            "department": f"This employee is the Branch Manager of '{mb.name}' and must work in a department of that branch."
                        })

            new_company_id = department.branch.company_id if department.branch_id else None
            for sub in instance.subordinates.filter(is_deleted=False):
                sub_company_id = sub.department.branch.company_id if sub.department and sub.department.branch_id else None
                if sub_company_id and new_company_id != sub_company_id:
                    raise serializers.ValidationError({
                        "department": f"Cannot move employee to another company while '{sub.first_name} {sub.last_name}' reports to them."
                    })

        # Resignation date: required on separation, cleared on reactivation, never before hire.
        hire_date = attrs.get('hire_date', instance.hire_date if instance else None)
        resignation_date = attrs.get(
            'resignation_date', instance.resignation_date if instance else None
        )
        status_key = status_val.lower()
        if status_key in Employee.SEPARATION_STATUSES:
            if not resignation_date:
                raise serializers.ValidationError({
                    "resignation_date": "Resignation date is required when employment status is Resigned or Terminated."
                })
            if instance and instance.subordinates.filter(is_deleted=False).exists():
                raise serializers.ValidationError({
                    "employment_status": "Reassign this employee's direct reports to another manager first."
                })
        elif status_key == 'active':
            # Resigning/terminating is reversible (e.g. rehire); clear any stale date.
            resignation_date = None
            attrs['resignation_date'] = None

        if resignation_date and hire_date and resignation_date < hire_date:
            raise serializers.ValidationError({
                "resignation_date": "Resignation date cannot be before the hire date."
            })

        return attrs

    def create(self, validated_data):
        make_bm = validated_data.pop('make_branch_manager', False)
        make_dh = validated_data.pop('make_department_head', False)
        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)
        role = validated_data.pop('role', None)
        is_active = validated_data.pop('is_active', True)
        created_by = validated_data.get('created_by')

        with transaction.atomic():
            if 'user' not in validated_data or validated_data['user'] is None:
                user_kwargs = {
                    'username': username.strip(),
                    'email': validated_data.get('email', ''),
                    'password': password,
                    'role': role,
                    'is_active': is_active,
                }
                if created_by is not None:
                    user_kwargs['created_by'] = created_by
                validated_data['user'] = User.objects.create_user(**user_kwargs)

            employee = super().create(validated_data)

            if make_bm and employee.department and employee.department.branch:
                branch = employee.department.branch
                branch.manager = employee
                branch.full_clean()
                branch.save(update_fields=['manager', 'updated_at'])

            if make_dh and employee.department:
                dept = employee.department
                dept.head = employee
                dept.full_clean()
                dept.save(update_fields=['head', 'updated_at'])

            if hasattr(employee, '_prefetched_objects_cache'):
                employee._prefetched_objects_cache.clear()
            return employee

    def update(self, instance, validated_data):
        make_bm = validated_data.pop('make_branch_manager', _UNSET)
        make_dh = validated_data.pop('make_department_head', _UNSET)
        validated_data.pop('username', None)
        validated_data.pop('password', None)
        validated_data.pop('role', None)
        validated_data.pop('is_active', None)

        target_dept = validated_data.get('department', instance.department)

        with transaction.atomic():
            if make_dh is not _UNSET:
                for hd in instance.headed_departments.filter(is_deleted=False):
                    if not make_dh or (target_dept and hd.id != target_dept.id):
                        hd.head = None
                        hd.save(update_fields=['head', 'updated_at'])

            if make_bm is not _UNSET:
                for mb in instance.managed_branches.filter(is_deleted=False):
                    if not make_bm or (target_dept and mb.id != target_dept.branch_id):
                        mb.manager = None
                        mb.save(update_fields=['manager', 'updated_at'])

            employee = super().update(instance, validated_data)

            if make_bm is True and employee.department and employee.department.branch:
                branch = employee.department.branch
                branch.manager = employee
                branch.full_clean()
                branch.save(update_fields=['manager', 'updated_at'])

            if make_dh is True and employee.department:
                dept = employee.department
                dept.head = employee
                dept.full_clean()
                dept.save(update_fields=['head', 'updated_at'])

            if hasattr(employee, '_prefetched_objects_cache'):
                employee._prefetched_objects_cache.clear()
            return employee
