
from rest_framework import serializers

from .models import AttendanceRecord


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    worked_minutes = serializers.ReadOnlyField()

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "employee",
            "employee_name",
            "work_date",
            "check_in",
            "check_out",
            "status",
            "notes",
            "worked_minutes",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_employee_name(self, obj):
        employee = obj.employee
        return (
            f"{employee.first_name} {employee.last_name}"
        ).strip()
