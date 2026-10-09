from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Role, User, Admin, Employee


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['role_name', 'description', 'public_id']
    search_fields = ['role_name']


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # Extend Django's built-in UserAdmin so username/password hashing UI still works,
    # but add our custom 'role' field into the fieldsets and list view.
    list_display = ['username', 'email', 'role', 'is_staff', 'is_active']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Role Info', {'fields': ('role', 'public_id')}),
    )
    readonly_fields = ['public_id']


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'email', 'employment_status', 'user']
    search_fields = ['first_name', 'last_name', 'email']


@admin.register(Admin)
class AdminProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'role']
    