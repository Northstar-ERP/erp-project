
from rest_framework import serializers

from apps.users.models import Employee
from .models import PerformanceMetric, ReviewCycle, Scorecard
from .permissions import get_employee, is_hr_or_admin, is_manager


class ReviewCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewCycle
        fields = (
            "public_id",
            "period_type",
            "period_label",
            "start_date",
            "end_date",
            "is_closed",
        )

    def validate(self, attrs):
        start = attrs.get(
            "start_date", getattr(self.instance, "start_date", None)
        )
        end = attrs.get(
            "end_date", getattr(self.instance, "end_date", None)
        )

        if start and end and end < start:
            raise serializers.ValidationError({
                "end_date": "End date cannot be before start date."
            })

        return attrs


class PerformanceMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerformanceMetric
        fields = ("public_id", "metric_name", "target", "actual", "weight")

    def validate_weight(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError(
                "Weight must be between 0 and 100."
            )
        return value


class ScorecardSerializer(serializers.ModelSerializer):
    employee = serializers.SlugRelatedField(
        slug_field="public_id",
        queryset=Employee.objects.all(),
    )
    employee_name = serializers.SerializerMethodField()
    cycle = serializers.SlugRelatedField(
        slug_field="public_id",
        queryset=ReviewCycle.objects.all(),
    )
    cycle_label = serializers.CharField(
        source="cycle.period_label", read_only=True
    )
    reviewer = serializers.SlugRelatedField(
        slug_field="public_id",
        queryset=Employee.objects.all(),
        required=False,
        allow_null=True,
    )
    reviewer_name = serializers.SerializerMethodField()
    rating_label = serializers.SerializerMethodField()
    metrics = PerformanceMetricSerializer(many=True, required=False)

    class Meta:
        model = Scorecard
        fields = (
            "public_id",
            "employee",
            "employee_name",
            "cycle",
            "cycle_label",
            "reviewer",
            "reviewer_name",
            "goals",
            "rating",
            "rating_label",
            "status",
            "submitted_at",
            "metrics",
        )
        read_only_fields = ("status", "submitted_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # The employee and cycle a scorecard was created for cannot change;
        # editing it after the fact means re-raising it as a new scorecard.
        if self.instance is not None:
            self.fields["employee"].read_only = True
            self.fields["cycle"].read_only = True

    def get_employee_name(self, obj):
        return str(obj.employee)

    def get_reviewer_name(self, obj):
        return str(obj.reviewer) if obj.reviewer_id else None

    def get_rating_label(self, obj):
        return obj.get_rating_display() if obj.rating else None

    def validate(self, attrs):
        cycle = attrs.get("cycle", getattr(self.instance, "cycle", None))
        employee = attrs.get(
            "employee", getattr(self.instance, "employee", None)
        )

        if cycle and cycle.is_closed:
            raise serializers.ValidationError({
                "cycle": "This review cycle is closed."
            })

        request = self.context.get("request")

        if request and request.user.is_authenticated:
            if (
                self.instance
                and self.instance.status == Scorecard.Status.SUBMITTED
                and not is_hr_or_admin(request.user)
            ):
                raise serializers.ValidationError(
                    "Submitted scorecards can only be modified by HR/Admin."
                )

            if not self.instance and not is_hr_or_admin(request.user):
                actor_employee = get_employee(request.user)

                if not (
                    is_manager(request.user)
                    and actor_employee
                    and employee
                    and employee.manager_id == actor_employee.pk
                ):
                    raise serializers.ValidationError(
                        "You can only create a scorecard for your direct reports."
                    )

        if not self.instance and employee and cycle:
            if Scorecard.objects.filter(employee=employee, cycle=cycle).exists():
                raise serializers.ValidationError(
                    "A scorecard already exists for this employee and cycle."
                )

        return attrs

    def create(self, validated_data):
        metrics_data = validated_data.pop("metrics", [])

        if not validated_data.get("reviewer"):
            validated_data["reviewer"] = validated_data["employee"].manager

        validated_data["status"] = Scorecard.Status.DRAFT

        scorecard = super().create(validated_data)

        for metric in metrics_data:
            PerformanceMetric.objects.create(scorecard=scorecard, **metric)

        return scorecard

    def update(self, instance, validated_data):
        metrics_data = validated_data.pop("metrics", None)
        instance = super().update(instance, validated_data)

        if metrics_data is not None:
            instance.metrics.all().delete()
            for metric in metrics_data:
                PerformanceMetric.objects.create(scorecard=instance, **metric)

        return instance
