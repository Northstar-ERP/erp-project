
from datetime import date

from django.db.models import Q
from django.utils.dateparse import parse_date

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AttendanceRecord
from .permissions import (
    CanViewAttendance,
    get_employee,
    is_hr_or_admin,
    is_manager,
)
from .serializers import AttendanceRecordSerializer
from .services import check_in, check_out


class AttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated, CanViewAttendance]

    def get_queryset(self):
        user = self.request.user

        queryset = AttendanceRecord.objects.filter(
            is_deleted=False
        ).select_related(
            "employee",
            "employee__user",
            "employee__manager",
            "created_by",
        )

        if is_hr_or_admin(user):
            pass
        else:
            employee = get_employee(user)

            if not employee:
                return queryset.none()

            if is_manager(user):
                queryset = queryset.filter(
                    Q(employee=employee)
                    | Q(employee__manager=employee)
                )
            else:
                queryset = queryset.filter(employee=employee)

        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if start_date:
            parsed_start = parse_date(start_date)
            if not parsed_start:
                raise ValidationError({
                    "start_date": "Use YYYY-MM-DD format."
                })
            queryset = queryset.filter(work_date__gte=parsed_start)

        if end_date:
            parsed_end = parse_date(end_date)
            if not parsed_end:
                raise ValidationError({
                    "end_date": "Use YYYY-MM-DD format."
                })
            queryset = queryset.filter(work_date__lte=parsed_end)

        if start_date and end_date and parsed_start > parsed_end:
            raise ValidationError(
                "start_date must be before or equal to end_date."
            )

        return queryset

    def _get_current_employee(self):
        employee = get_employee(self.request.user)
        if not employee:
            raise ValidationError(
                "Your account is not linked to an Employee profile."
            )
        return employee

    @action(detail=False, methods=["post"], url_path="check-in")
    def check_in_action(self, request):
        employee = self._get_current_employee()
        record = check_in(employee, request.user)

        return Response(
            self.get_serializer(record).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="check-out")
    def check_out_action(self, request):
        employee = self._get_current_employee()
        record = check_out(employee)

        return Response(
            self.get_serializer(record).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def summary(self, request):
        records = self.filter_queryset(self.get_queryset())

        total_days = records.count()
        checked_out_records = records.filter(
            check_in__isnull=False,
            check_out__isnull=False,
        )

        total_minutes = sum(
            record.worked_minutes or 0
            for record in checked_out_records
        )

        return Response({
            "total_attendance_days": total_days,
            "completed_days": checked_out_records.count(),
            "open_sessions": records.filter(
                check_in__isnull=False,
                check_out__isnull=True,
            ).count(),
            "total_worked_minutes": total_minutes,
            "total_worked_hours": round(total_minutes / 60, 2),
            "present_days": records.filter(
                status=AttendanceRecord.Status.PRESENT
            ).count(),
            "late_days": records.filter(
                status=AttendanceRecord.Status.LATE
            ).count(),
            "half_days": records.filter(
                status=AttendanceRecord.Status.HALF_DAY
            ).count(),
            "absent_days": records.filter(
                status=AttendanceRecord.Status.ABSENT
            ).count(),
        })
