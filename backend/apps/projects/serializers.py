from rest_framework import serializers
from apps.users.serializers import EmployeeDirectorySerializer
from apps.users.models import Employee
from .models import Project, Task


class ProjectSerializer(serializers.ModelSerializer):
    manager_details = EmployeeDirectorySerializer(source='manager', read_only=True)

    manager = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Employee.objects.all(),
        write_only=True
    )

    class Meta:
        model = Project
        fields = [
            'public_id', 'name', 'description',
            'manager', 'manager_details',
            'start_date', 'end_date', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'public_id',
            'manager_details',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        start_date = attrs.get(
            'start_date',
            self.instance.start_date if self.instance else None,
        )
        end_date = attrs.get(
            'end_date',
            self.instance.end_date if self.instance else None,
        )

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                "End date cannot be before start date."
            )

        if self.instance:
            if start_date and self.instance.tasks.filter(
                deadline__lt=start_date,
            ).exists():
                raise serializers.ValidationError(
                    "Project start date cannot be after an existing task deadline."
                )
            if end_date and self.instance.tasks.filter(
                deadline__gt=end_date,
            ).exists():
                raise serializers.ValidationError(
                    "Project end date cannot be before an existing task deadline."
                )
        return attrs


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_details = EmployeeDirectorySerializer(
        source='assigned_to',
        read_only=True,
    )

    assigned_to = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Employee.objects.all(),
        write_only=True
    )

    project = serializers.SlugRelatedField(
        slug_field='public_id',
        queryset=Project.objects.all()
    )

    class Meta:
        model = Task
        fields = [
            'public_id', 'project',
            'assigned_to', 'assigned_to_details',
            'title', 'description', 'deadline', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'public_id',
            'assigned_to_details',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        project = attrs.get(
            'project',
            self.instance.project if self.instance else None,
        )
        deadline = attrs.get(
            'deadline',
            self.instance.deadline if self.instance else None,
        )

        if project and deadline:
            if project.start_date and deadline < project.start_date:
                raise serializers.ValidationError(
                    "Task deadline cannot be before project start date."
                )
            if project.end_date and deadline > project.end_date:
                raise serializers.ValidationError(
                    "Task deadline cannot be after project end date."
                )
        return attrs
