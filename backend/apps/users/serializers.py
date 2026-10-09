from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password as django_validate_password
from .models import Role, User, Employee
from apps.organization.models import Department

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims to the JWT payload
        token['username'] = user.username
        token['role'] = user.role.role_name if user.role else None

        return token


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

    class Meta:
        model = User
        fields = ['public_id', 'username', 'email', 'role', 'is_active', 'password']
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

    class Meta:
        model = Employee
        fields = [
            'public_id',
            'first_name',
            'last_name',
            'job_title',
            'role_name',
            'department_name',
        ]


class EmployeeSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)

    user = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=User.objects.all(),
        write_only=True
    )

    department = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Department.objects.all(),
        allow_null=True,
        required=False
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
            'public_id', 'user', 'user_details', 'first_name', 'last_name',
            'email', 'phone', 'hire_date', 'employment_status',
            'job_title', 'department', 'manager'
        ]

    def validate_manager(self, value):
        if self.instance and value and value.public_id == self.instance.public_id:
            raise serializers.ValidationError("An employee cannot be their own manager.")
        return value

    def validate(self, attrs):
        manager = attrs.get('manager')
        instance = self.instance

        if manager and instance:
            # Check for circular reference: traverse up the manager chain
            current = manager
            visited = set()
            while current:
                if current.public_id == instance.public_id:
                    raise serializers.ValidationError(
                        "Circular manager reference detected."
                    )
                if current.public_id in visited:
                    break
                visited.add(current.public_id)
                current = current.manager
        return attrs