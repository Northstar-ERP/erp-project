from rest_framework import serializers
from apps.users.models import Employee
from .models import Company, Branch, Department, Team


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = [
            'public_id', 'name', 'registration_number', 'address', 'contact_email',
            'creation_reason', 'created_at', 'updated_at',
        ]
        read_only_fields = ['public_id', 'created_at', 'updated_at']


class BranchSerializer(serializers.ModelSerializer):
    # Instructs DRF to expect a UUID and map it to the company's public_id
    company = serializers.SlugRelatedField(queryset=Company.objects.all(), slug_field='public_id')
    company_name = serializers.CharField(source='company.name', read_only=True)
    manager = serializers.SlugRelatedField(
        queryset=Employee.objects.all(),
        slug_field='public_id',
        allow_null=True,
        required=False,
    )
    manager_name = serializers.SerializerMethodField()
    manager_email = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = [
            'public_id', 'company', 'company_name', 'name', 'location',
            'contact_phone', 'creation_reason', 'manager', 'manager_name', 'manager_email',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['public_id', 'created_at', 'updated_at']

    def get_manager_name(self, obj):
        if obj.manager:
            return f"{obj.manager.first_name} {obj.manager.last_name}".strip()
        return None

    def get_manager_email(self, obj):
        return obj.manager.email if obj.manager else None

    def validate(self, attrs):
        if 'manager' in attrs:
            manager = attrs.get('manager')
            if manager is not None:
                if not self.instance:
                    raise serializers.ValidationError({
                        'manager': 'Branch manager must work in this branch. Create the branch and assign employees to its departments before designating a branch manager.'
                    })
                if not manager.department or manager.department.branch_id != self.instance.id:
                    raise serializers.ValidationError({
                        'manager': 'Branch manager must work in this branch.'
                    })
        return attrs


class DepartmentSerializer(serializers.ModelSerializer):
    # Instructs DRF to expect a UUID and map it to the branch's public_id
    branch = serializers.SlugRelatedField(queryset=Branch.objects.all(), slug_field='public_id')
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    company = serializers.SlugRelatedField(source='branch.company', slug_field='public_id', read_only=True)
    company_name = serializers.CharField(source='branch.company.name', read_only=True)
    head = serializers.SlugRelatedField(
        queryset=Employee.objects.all(),
        slug_field='public_id',
        allow_null=True,
        required=False,
    )
    head_name = serializers.SerializerMethodField()
    head_email = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            'public_id', 'branch', 'branch_name', 'company', 'company_name',
            'name', 'description', 'head', 'head_name', 'head_email',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['public_id', 'created_at', 'updated_at']

    def get_head_name(self, obj):
        if obj.head:
            return f"{obj.head.first_name} {obj.head.last_name}".strip()
        return None

    def get_head_email(self, obj):
        return obj.head.email if obj.head else None

    def validate(self, attrs):
        if 'head' in attrs:
            head = attrs.get('head')
            if head is not None:
                if not self.instance:
                    raise serializers.ValidationError({
                        'head': 'Department head must belong to this department. Create the department and assign employees before designating a department head.'
                    })
                if head.department_id != self.instance.id:
                    raise serializers.ValidationError({
                        'head': 'Department head must belong to this department.'
                    })

        if 'branch' in attrs and self.instance:
            new_branch = attrs.get('branch')
            old_branch = self.instance.branch
            if new_branch and old_branch and new_branch.id != old_branch.id:
                if old_branch.manager_id and old_branch.manager.department_id == self.instance.id:
                    raise serializers.ValidationError({
                        'branch': f"Cannot move this department out of '{old_branch.name}' while its branch manager belongs to it. Reassign the branch manager first."
                    })
        return attrs


class TeamSerializer(serializers.ModelSerializer):
    # Instructs DRF to expect a UUID and map it to the department's public_id
    department = serializers.SlugRelatedField(queryset=Department.objects.all(), slug_field='public_id')
    department_name = serializers.CharField(source='department.name', read_only=True)
    branch_name = serializers.CharField(source='department.branch.name', read_only=True)
    company_name = serializers.CharField(source='department.branch.company.name', read_only=True)

    class Meta:
        model = Team
        fields = ['public_id', 'department', 'department_name', 'branch_name', 'company_name', 'name', 'created_at', 'updated_at']
        read_only_fields = ['public_id', 'created_at', 'updated_at']
