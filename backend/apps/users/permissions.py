from rest_framework import permissions

class IsSystemAdmin(permissions.BasePermission):
    """Global access for master setups, users, and system configs."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role and request.user.role.role_name == 'System Admin'

class IsHRManager(permissions.BasePermission):
    """Access for employee lifecycles, departments, and organization hierarchy."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role and request.user.role.role_name == 'HR Manager'

class IsProjectManager(permissions.BasePermission):
    """Access for assigned team members, projects, tasks, and leave approvals."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role and request.user.role.role_name == 'Department / Project Manager'

class IsEmployee(permissions.BasePermission):
    """Self-service access for daily tasks, own leaves, and assets."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role and request.user.role.role_name == 'Employee'


class IsSystemAdminOrHRManager(permissions.BasePermission):
    """Write access for System Admins and HR Managers."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if request.user.role is None:
            return False
        return request.user.role.role_name in ['System Admin', 'HR Manager']