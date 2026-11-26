from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.expense.models import Expense, ExpenseCategory
from apps.users.models import Employee


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ['public_id', 'name', 'description', 'is_active']


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    employee_name = serializers.SerializerMethodField(read_only=True)
    category = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=ExpenseCategory.objects.filter(is_active=True),
    )

    class Meta:
        model = Expense
        fields = [
            'public_id',
            'amount',
            'expense_date',
            'description',
            'receipt',
            'status',
            'submitted_at',
            'approved_at',
            'remarks',
            'category',
            'category_name',
            'employee_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'status',
            'submitted_at',
            'approved_at',
            'employee',
            'created_at',
            'updated_at',
        ]

    def get_employee_name(self, obj):
        if hasattr(obj, 'employee') and obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}"
        return "Unknown"

    def create(self, validated_data):
        request = self.context.get('request')
        if not request or not request.user:
            raise ValidationError("Authentication credentials were not provided.")

        try:
            # Assumes a OneToOne or ForeignKey relation from User to Employee
            employee = request.user.employee_profile
        except (AttributeError, Employee.DoesNotExist):
            raise ValidationError("Employee profile not found for this user.")

        validated_data['employee'] = employee
        validated_data['status'] = 'PENDING'
        return super().create(validated_data)