from datetime import date

from rest_framework.test import APITestCase

from apps.users.models import Employee, Role, User


class AttendanceVisibilityTests(APITestCase):
    """Role names must match the real roles (System Admin / HR Manager / PM)."""

    def setUp(self):
        roles = {
            name: Role.objects.create(role_name=name)
            for name in ['HR Manager', 'Department / Project Manager', 'Employee']
        }
        self.users = {}
        self.emps = {}
        for key, role, manager_key in [
            ('hr', 'HR Manager', None),
            ('pm', 'Department / Project Manager', None),
            ('report', 'Employee', 'pm'),
            ('other', 'Employee', None),
        ]:
            user = User.objects.create_user(key, password='N3w!StrongPassword85', role=roles[role])
            self.users[key] = user
            self.emps[key] = Employee.objects.create(
                user=user, first_name=key, last_name='X', email=f'{key}@x.test',
                hire_date=date(2024, 1, 1), manager=self.emps.get(manager_key),
            )
        for key in self.users:
            self.client.force_authenticate(self.users[key])
            self.assertEqual(self.client.post('/api/attendance/check-in/').status_code, 201)

    def names_seen_by(self, key):
        self.client.force_authenticate(self.users[key])
        response = self.client.get('/api/attendance/')
        self.assertEqual(response.status_code, 200)
        return sorted(r['employee_name'] for r in response.data)

    def test_hr_sees_everyone(self):
        self.assertEqual(self.names_seen_by('hr'), ['hr X', 'other X', 'pm X', 'report X'])

    def test_manager_sees_self_and_direct_reports(self):
        self.assertEqual(self.names_seen_by('pm'), ['pm X', 'report X'])

    def test_employee_sees_only_self(self):
        self.assertEqual(self.names_seen_by('other'), ['other X'])

    def test_record_exposes_employee_public_id_and_checkout_works(self):
        self.client.force_authenticate(self.users['other'])
        response = self.client.post('/api/attendance/check-out/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['employee_public_id'], str(self.emps['other'].public_id))
        self.assertIsNotNone(response.data['worked_minutes'])
