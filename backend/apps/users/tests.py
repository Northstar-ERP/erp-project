from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organization.models import Branch, Company, Department
from apps.users.models import Employee, Role, User


class UserPasswordApiTests(APITestCase):
    def setUp(self):
        admin_role = Role.objects.create(role_name='System Admin')
        self.admin = User.objects.create_user(
            username='api-admin',
            password='S3cure!AdminPass#93',
            role=admin_role,
        )
        self.client.force_authenticate(self.admin)

    def test_create_hashes_password_and_never_returns_it(self):
        response = self.client.post(
            reverse('user-list'),
            {
                'username': 'new-api-user',
                'email': 'new-api-user@example.com',
                'password': 'N7!pVx#Q2zLm8$wR',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertNotIn('password', response.data)
        user = User.objects.get(public_id=response.data['public_id'])
        self.assertTrue(user.check_password('N7!pVx#Q2zLm8$wR'))

    def test_update_hashes_password_and_rejects_weak_password(self):
        user = User.objects.create_user(
            username='existing-user',
            password='Old!StrongPassword72',
        )
        url = reverse('user-detail', kwargs={'public_id': str(user.public_id)})

        response = self.client.patch(
            url,
            {'password': 'N3w!StrongPassword85'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn('password', response.data)
        user.refresh_from_db()
        self.assertTrue(user.check_password('N3w!StrongPassword85'))

        weak_response = self.client.patch(
            url,
            {'password': 'password'},
            format='json',
        )

        self.assertEqual(
            weak_response.status_code,
            status.HTTP_400_BAD_REQUEST,
            weak_response.data,
        )

    def test_user_detail_url_uses_public_uuid(self):
        user = User.objects.create_user(
            username='uuid-detail-user',
            password='N3w!StrongPassword85',
        )

        response = self.client.get(
            reverse('user-detail', kwargs={'public_id': str(user.public_id)})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['public_id'], str(user.public_id))


class EmployeeDirectoryApiTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.employee_role = Role.objects.create(role_name='Employee')
        self.manager_role = Role.objects.create(
            role_name='Department / Project Manager'
        )
        self.admin = User.objects.create_user(
            username='directory-admin',
            password='S3cure!AdminPass#93',
            role=self.admin_role,
        )
        self.employee_user = User.objects.create_user(
            username='directory-employee',
            password='N3w!StrongPassword85',
            email='directory-employee@example.com',
            role=self.employee_role,
        )
        manager_user = User.objects.create_user(
            username='directory-manager',
            password='N3w!StrongPassword85',
            role=self.manager_role,
        )

        company = Company.objects.create(
            name='Example Corporation',
            registration_number='REG-DIR-001',
            address='Private company address',
            contact_email='company@example.com',
        )
        branch = Branch.objects.create(
            company=company,
            name='Main Branch',
            location='Main office',
        )
        department = Department.objects.create(
            branch=branch,
            name='Engineering',
        )
        self.employee = Employee.objects.create(
            user=self.employee_user,
            first_name='Riley',
            last_name='Employee',
            email='riley@example.com',
            phone='555-0101',
            hire_date=date(2024, 1, 15),
            department=department,
        )
        self.manager = Employee.objects.create(
            user=manager_user,
            first_name='Morgan',
            last_name='Manager',
            email='morgan@example.com',
            hire_date=date(2020, 3, 10),
            department=department,
        )

    def test_employee_can_list_safe_directory_fields_only(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.get(reverse('employee-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data), 2)
        employee_data = next(
            item for item in response.data
            if item['public_id'] == str(self.employee.public_id)
        )
        self.assertEqual(employee_data['first_name'], 'Riley')
        self.assertEqual(employee_data['role_name'], 'Employee')
        self.assertEqual(employee_data['department_name'], 'Engineering')
        self.assertEqual(
            set(employee_data),
            {
                'public_id',
                'first_name',
                'last_name',
                'job_title',
                'role_name',
                'department_name',
            },
        )

    def test_employee_directory_detail_is_safe_and_read_only(self):
        self.client.force_authenticate(self.employee_user)
        detail_url = reverse(
            'employee-detail',
            kwargs={'public_id': str(self.manager.public_id)},
        )

        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['first_name'], 'Morgan')
        self.assertNotIn('hire_date', response.data)
        self.assertNotIn('email', response.data)
        self.assertNotIn('phone', response.data)

        write_response = self.client.patch(
            detail_url,
            {'first_name': 'Changed'},
            format='json',
        )
        self.assertEqual(
            write_response.status_code,
            status.HTTP_403_FORBIDDEN,
            write_response.data,
        )

    def test_employee_cannot_read_full_organization_records(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.get(reverse('company-list'))

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            response.data,
        )

    def test_admin_sees_full_employee_records(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(reverse('employee-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        employee_data = next(
            item for item in response.data
            if item['public_id'] == str(self.employee.public_id)
        )
        self.assertIn('hire_date', employee_data)
        self.assertIn('email', employee_data)
        self.assertIn('phone', employee_data)

    def test_employee_manager_cannot_be_self_or_create_a_cycle(self):
        self.client.force_authenticate(self.admin)
        employee_url = reverse(
            'employee-detail',
            kwargs={'public_id': str(self.employee.public_id)},
        )
        manager_url = reverse(
            'employee-detail',
            kwargs={'public_id': str(self.manager.public_id)},
        )

        self_response = self.client.patch(
            employee_url,
            {'manager': str(self.employee.public_id)},
            format='json',
        )
        self.assertEqual(
            self_response.status_code,
            status.HTTP_400_BAD_REQUEST,
            self_response.data,
        )

        valid_manager_response = self.client.patch(
            employee_url,
            {'manager': str(self.manager.public_id)},
            format='json',
        )
        self.assertEqual(
            valid_manager_response.status_code,
            status.HTTP_200_OK,
            valid_manager_response.data,
        )

        cycle_response = self.client.patch(
            manager_url,
            {'manager': str(self.employee.public_id)},
            format='json',
        )
        self.assertEqual(
            cycle_response.status_code,
            status.HTTP_400_BAD_REQUEST,
            cycle_response.data,
        )
