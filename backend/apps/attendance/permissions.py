
from rest_framework.permissions import BasePermission

from users.models import Employee


def get_employee(user):
    try:
        return user.employee_profile
    except (AttributeError, Employee.DoesNotExist):
        return None


def is_hr_or_admin(user):
    role = getattr(user, "role", None)
    role_name = (
        getattr(role, "role_name", "") or ""
    ).strip().lower()

    return bool(
        user.is_authenticated
        and (
            user.is_superuser
            or role_name in {"admin", "hr"}
        )
    )


def is_manager(user):
    role = getattr(user, "role", None)
    role_name = (
        getattr(role, "role_name", "") or ""
    ).strip().lower()

    return bool(
        user.is_authenticated
        and role_name == "manager"
    )


class CanViewAttendance(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
        )
