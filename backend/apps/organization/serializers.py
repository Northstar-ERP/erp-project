from rest_framework import serializers
from .models import Company, Branch, Department, Team

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['public_id', 'name', 'registration_number', 'address', 'contact_email', 'created_at', 'updated_at']
        read_only_fields = ['public_id', 'created_at', 'updated_at']

class BranchSerializer(serializers.ModelSerializer):
    # Instructs DRF to expect a UUID and map it to the company's public_id
    company = serializers.SlugRelatedField(queryset=Company.objects.all(), slug_field='public_id')
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = Branch
        fields = ['public_id', 'company', 'company_name', 'name', 'location', 'contact_phone', 'created_at', 'updated_at']
        read_only_fields = ['public_id', 'created_at', 'updated_at']

class DepartmentSerializer(serializers.ModelSerializer):
    # Instructs DRF to expect a UUID and map it to the branch's public_id
    branch = serializers.SlugRelatedField(queryset=Branch.objects.all(), slug_field='public_id')
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    company_name = serializers.CharField(source='branch.company.name', read_only=True)

    class Meta:
        model = Department
        fields = ['public_id', 'branch', 'branch_name', 'company_name', 'name', 'description', 'created_at', 'updated_at']
        read_only_fields = ['public_id', 'created_at', 'updated_at']

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