
from rest_framework import serializers

from apps.organization.models import Company
from .models import LeaveType, LeavePolicy, LeaveRequest, LeaveBalance
from .permissions import get_employee, get_employee_company


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ("public_id", "name", "description", "is_paid", "is_active")


class LeavePolicySerializer(serializers.ModelSerializer):
    company = serializers.SlugRelatedField(
        slug_field="public_id",
        queryset=Company.objects.all(),
    )
    leave_type = serializers.SlugRelatedField(
        slug_field="public_id",
        queryset=LeaveType.objects.all(),
    )
    leave_type_name = serializers.CharField(
        source="leave_type.name",
        read_only=True,
    )
    company_name = serializers.CharField(
        source="company.name",
        read_only=True,
    )

    class Meta:
        model = LeavePolicy
        fields = (
            "public_id",
            "company",
            "company_name",
            "leave_type",
            "leave_type_name",
            "year",
            "annual_allowance",
            "carry_forward_allowed",
            "max_carry_forward",
            "requires_approval",
            "is_active",
        )


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee = serializers.SlugRelatedField(
        slug_field="public_id",
        read_only=True,
    )
    employee_name = serializers.SerializerMethodField()
    leave_type = serializers.SlugRelatedField(
        slug_field="public_id",
        queryset=LeaveType.objects.all(),
    )
    leave_type_name = serializers.CharField(
        source="leave_type.name",
        read_only=True,
    )
    reviewed_by = serializers.SlugRelatedField(
        slug_field="public_id",
        read_only=True,
    )
    duration = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = (
            "public_id",
            "employee",
            "employee_name",
            "leave_type",
            "leave_type_name",
            "start_date",
            "end_date",
            "reason",
            "status",
            "reviewed_by",
            "reviewer_comment",
            "reviewed_at",
            "duration",
        )
        read_only_fields = (
            "employee",
            "status",
            "reviewed_by",
            "reviewer_comment",
            "reviewed_at",
        )

    def get_employee_name(self, obj):
        return str(obj.employee)

    def get_duration(self, obj):
        return (obj.end_date - obj.start_date).days + 1

    def validate(self, attrs):
        start = attrs.get(
            "start_date",
            getattr(self.instance, "start_date", None),
        )
        end = attrs.get(
            "end_date",
            getattr(self.instance, "end_date", None),
        )
        leave_type = attrs.get(
            "leave_type",
            getattr(self.instance, "leave_type", None),
        )

        if start and end:
            if end < start:
                raise serializers.ValidationError({
                    "end_date": "End date cannot be before start date."
                })

            if start.year != end.year:
                raise serializers.ValidationError(
                    "A leave request cannot span multiple calendar years."
                )

        request = self.context.get("request")

        if request and request.user.is_authenticated:
            employee = get_employee(request.user)

            if not employee:
                raise serializers.ValidationError(
                    "Your account is not linked to an employee profile."
                )

            company = get_employee_company(employee)

            if not company:
                raise serializers.ValidationError(
                    "Your employee profile must have a department "
                    "linked to a company."
                )

            if leave_type:
                if not leave_type.is_active:
                    raise serializers.ValidationError({
                        "leave_type": "This leave type is inactive."
                    })

                if not LeavePolicy.objects.filter(
                    company=company,
                    leave_type=leave_type,
                    year=start.year if start else None,
                    is_active=True,
                ).exists():
                    raise serializers.ValidationError({
                        "leave_type": (
                            "No active leave policy exists for your "
                            "company and the selected leave year."
                        )
                    })

            if start and end:
                overlapping = LeaveRequest.objects.filter(
                    employee=employee,
                    start_date__lte=end,
                    end_date__gte=start,
                ).exclude(
                    status__in=[
                        LeaveRequest.Status.REJECTED,
                        LeaveRequest.Status.CANCELLED,
                    ]
                )

                if self.instance:
                    overlapping = overlapping.exclude(
                        pk=self.instance.pk
                    )

                if overlapping.exists():
                    raise serializers.ValidationError(
                        "You already have an active leave request "
                        "for overlapping dates."
                    )

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        employee = get_employee(request.user) if request and request.user.is_authenticated else None
        if not employee:
            raise serializers.ValidationError(
                "Your account is not linked to an employee profile."
            )
        validated_data["employee"] = employee
        validated_data["status"] = LeaveRequest.Status.PENDING
        return super().create(validated_data)


class LeaveBalanceSerializer(serializers.ModelSerializer):
    employee = serializers.SlugRelatedField(
        slug_field="public_id",
        read_only=True,
    )
    employee_name = serializers.SerializerMethodField()
    company = serializers.SlugRelatedField(
        slug_field="public_id",
        read_only=True,
    )
    leave_type = serializers.SlugRelatedField(
        slug_field="public_id",
        read_only=True,
    )
    leave_type_name = serializers.CharField(
        source="leave_type.name",
        read_only=True,
    )
    company_name = serializers.CharField(
        source="company.name",
        read_only=True,
    )
    available = serializers.IntegerField(read_only=True)

    class Meta:
        model = LeaveBalance
        fields = (
            "public_id",
            "employee",
            "employee_name",
            "company",
            "company_name",
            "leave_type",
            "leave_type_name",
            "year",
            "allocated",
            "used",
            "carried_forward",
            "available",
        )
        read_only_fields = (
            "employee",
            "company",
            "leave_type",
            "year",
            "allocated",
            "used",
            "carried_forward",
        )

    def get_employee_name(self, obj):
        return str(obj.employee)
