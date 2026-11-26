
from django.test import TestCase
from apps.leave.models import LeaveType


class LeaveTypeTests(TestCase):

    def test_create_paid_leave_type(self):
        leave_type = LeaveType.objects.create(
            name="Casual Leave",
            description="Leave for personal reasons",
            is_paid=True,
        )

        self.assertEqual(leave_type.name, "Casual Leave")
        self.assertTrue(leave_type.is_paid)
        self.assertTrue(leave_type.is_active)

    def test_leave_type_string_representation(self):
        leave_type = LeaveType.objects.create(
            name="Sick Leave",
        )

        self.assertEqual(str(leave_type), "Sick Leave")


from django.core.cache import cache as _cache
from django.test import override_settings as _override_settings
from rest_framework.test import APITestCase as _APITestCase


@_override_settings(MODEL_CACHE_ENABLED=True)
class LeavePolicyCacheIsolationTests(_APITestCase):
    """Cached policy lists must never leak one company's policies to another."""

    def setUp(self):
        from datetime import date as _date

        from apps.leave.models import LeavePolicy, LeaveType
        from apps.organization.models import Branch, Company, Department
        from apps.users.models import Employee, Role, User

        _cache.clear()
        role = Role.objects.create(role_name='Employee')
        leave_type = LeaveType.objects.create(name='Annual')
        self.users = {}
        for key in ('a', 'b'):
            company = Company.objects.create(
                name=f'Co {key}', registration_number=f'LP-{key}', address='x', contact_email=f'{key}@x.test',
            )
            dept = Department.objects.create(
                branch=Branch.objects.create(company=company, name='HQ', location='x'), name='Ops',
            )
            user = User.objects.create_user(f'lp-{key}', password='N3w!StrongPassword85', role=role)
            Employee.objects.create(
                user=user, first_name=key, last_name='X', email=f'lp-{key}@x.test',
                hire_date=_date(2024, 1, 1), department=dept,
            )
            LeavePolicy.objects.create(company=company, leave_type=leave_type, year=2026, annual_allowance=10)
            self.users[key] = (user, company.name)

    def test_each_employee_sees_only_their_company_even_with_cache(self):
        for key in ('a', 'b', 'a'):
            user, company_name = self.users[key]
            self.client.force_authenticate(user)
            response = self.client.get('/api/leave/policies/')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(len(response.data), 1)
            self.assertEqual(response.data[0]['company_name'], company_name)
