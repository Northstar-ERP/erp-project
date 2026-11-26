
from rest_framework.permissions import BasePermission, SAFE_METHODS


def get_role_name(user):
    role = getattr(user, "role", None)
    return (getattr(role, "role_name", "") or "").strip().lower()


def is_hr_or_admin(user):
    return (
        user.is_authenticated
        and (
            user.is_superuser
            or get_role_name(user) in {
                "admin",
                "system admin",
                "hr",
                "hr manager",
            }
        )
    )


def is_manager(user):
    return (
        user.is_authenticated
        and get_role_name(user) in {
            "manager",
            "department / project manager",
        }
    )


def get_employee(user):
    try:
        return user.employee_profile
    except AttributeError:
        return None


def get_employee_company(employee):
    if not employee or not employee.department_id:
        return None

    return employee.department.branch.company


class IsHRAdminOrReadOnly(BasePermission):
    """Only HR/admin users may change leave configuration."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in SAFE_METHODS:
            return True

        return is_hr_or_admin(request.user)


class CanReviewLeave(BasePermission):
    """Only HR/admin or the employee's assigned manager may review."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
        )

    def has_object_permission(self, request, view, obj):
        if is_hr_or_admin(request.user):
            return True

        employee = get_employee(request.user)

        return bool(
            employee
            and is_manager(request.user)
            and obj.employee.manager_id == employee.pk
        )
