from datetime import date

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

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
                'employee_code',
                'first_name',
                'last_name',
                'job_title',
                'role_name',
                'department_name',
                'branch_name',
                'company_name',
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


from django.test.utils import override_settings


@override_settings(MAILERS={'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}})
class EmployeeAccountActivationTests(APITestCase):
    def setUp(self):
        from django.core import mail
        if hasattr(mail, 'outbox'):
            mail.outbox.clear()

        self.admin_role = Role.objects.create(role_name='System Admin')
        self.hr_role = Role.objects.create(role_name='HR Manager')
        self.employee_role = Role.objects.create(role_name='Employee')

        self.hr_user = User.objects.create_user(
            username='hr_specialist',
            password='S3cure!AdminPass#93',
            email='hr@northstar.example',
            role=self.hr_role,
        )

        # Pending employee account (is_active=False)
        self.pending_user = User.objects.create_user(
            username='new_joiner',
            password='Temporary!Pass#123',
            email='joiner@example.com',
            role=self.employee_role,
            is_active=False,
        )
        self.employee = Employee.objects.create(
            user=self.pending_user,
            first_name='Alex',
            last_name='Taylor',
            email='joiner@example.com',
            hire_date=date(2026, 11, 7),
            employment_status='Pending',
        )

    def test_hr_can_send_invitation_email(self):
        from django.core import mail

        self.client.force_authenticate(self.hr_user)
        response = self.client.post(
            reverse('invite_employee'),
            {'email': 'joiner@example.com'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)

        sent_email = mail.outbox[0]
        self.assertIn('joiner@example.com', sent_email.to)
        self.assertIn('Welcome to Northstar ERP', sent_email.subject)
        self.assertIn('/activate?token=', sent_email.body)

    def test_activation_flow_and_single_use_token(self):
        from apps.users.services import generate_activation_token

        token = generate_activation_token(self.pending_user)

        # Step 1: Employee opens activation link (GET)
        verify_url = f"{reverse('account_activation')}?token={token}"
        verify_res = self.client.get(verify_url)
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK, verify_res.data)
        self.assertTrue(verify_res.data['valid'])
        self.assertEqual(verify_res.data['email'], 'joiner@example.com')

        # Step 2: Employee creates new password (POST)
        activate_res = self.client.post(
            reverse('account_activation'),
            {
                'token': token,
                'password': 'N3w!SecurePassword#2026',
                'password_confirm': 'N3w!SecurePassword#2026',
            },
            format='json',
        )
        self.assertEqual(activate_res.status_code, status.HTTP_200_OK, activate_res.data)

        # Verify user is now active and can log in with new password
        self.pending_user.refresh_from_db()
        self.assertTrue(self.pending_user.is_active)
        self.assertTrue(self.pending_user.check_password('N3w!SecurePassword#2026'))

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, 'Active')

        # Step 3: Repeated use of the same token is rejected
        second_attempt = self.client.post(
            reverse('account_activation'),
            {
                'token': token,
                'password': 'Another!Password#2026',
                'password_confirm': 'Another!Password#2026',
            },
            format='json',
        )
        self.assertEqual(second_attempt.status_code, status.HTTP_400_BAD_REQUEST)


class EmployeeHierarchyValidationTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.hr_role = Role.objects.create(role_name='HR Manager')
        self.employee_role = Role.objects.create(role_name='Employee')

        self.hr_user = User.objects.create_user(
            username='hr_lead',
            password='S3cure!AdminPass#93',
            email='hrlead@northstar.example',
            role=self.hr_role,
        )

        self.company_a = Company.objects.create(
            name='Alpha Corp',
            registration_number='REG-ALPHA-01',
            address='Alpha Address',
            contact_email='info@alpha.example',
        )
        self.company_b = Company.objects.create(
            name='Beta Corp',
            registration_number='REG-BETA-01',
            address='Beta Address',
            contact_email='info@beta.example',
        )

        self.branch_a1 = Branch.objects.create(
            company=self.company_a, name='Alpha East', location='NYC'
        )
        self.branch_a2 = Branch.objects.create(
            company=self.company_a, name='Alpha West', location='LA'
        )
        self.branch_b1 = Branch.objects.create(
            company=self.company_b, name='Beta HQ', location='Austin'
        )

        self.dept_a1_eng = Department.objects.create(
            branch=self.branch_a1, name='Engineering'
        )
        self.dept_a2_sales = Department.objects.create(
            branch=self.branch_a2, name='Sales'
        )
        self.dept_b1_ops = Department.objects.create(
            branch=self.branch_b1, name='Operations'
        )

        self.user_a1 = User.objects.create_user(
            username='emp_a1', password='Strong!Password#12', role=self.employee_role
        )
        self.emp_a1 = Employee.objects.create(
            user=self.user_a1,
            first_name='Alice',
            last_name='Alpha',
            email='alice@alpha.example',
            hire_date=date(2024, 1, 1),
            employment_status='Active',
            department=self.dept_a1_eng,
        )

        self.user_b1 = User.objects.create_user(
            username='emp_b1', password='Strong!Password#12', role=self.employee_role
        )
        self.emp_b1 = Employee.objects.create(
            user=self.user_b1,
            first_name='Bob',
            last_name='Beta',
            email='bob@beta.example',
            hire_date=date(2024, 2, 1),
            employment_status='Active',
            department=self.dept_b1_ops,
        )

    def test_department_required_for_new_and_active_employees(self):
        self.client.force_authenticate(self.hr_user)
        new_user = User.objects.create_user(
            username='no_dept_user', password='Strong!Password#12', role=self.employee_role
        )
        # Missing department for new employee should fail
        res = self.client.post(
            reverse('employee-list'),
            {
                'user': str(new_user.public_id),
                'first_name': 'No',
                'last_name': 'Dept',
                'email': 'nodept@alpha.example',
                'hire_date': '2026-01-01',
                'employment_status': 'Active',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('department', res.data)

        # Providing valid department succeeds and derives branch and company
        res_ok = self.client.post(
            reverse('employee-list'),
            {
                'user': str(new_user.public_id),
                'first_name': 'With',
                'last_name': 'Dept',
                'email': 'withdept@alpha.example',
                'hire_date': '2026-01-01',
                'employment_status': 'Active',
                'department': str(self.dept_a1_eng.public_id),
            },
            format='json',
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED, res_ok.data)
        self.assertEqual(res_ok.data['branch_name'], 'Alpha East')
        self.assertEqual(res_ok.data['company_name'], 'Alpha Corp')

    def test_manager_must_be_in_same_company(self):
        self.client.force_authenticate(self.hr_user)
        new_user = User.objects.create_user(
            username='cross_co_user', password='Strong!Password#12', role=self.employee_role
        )
        # Try creating Alpha Corp employee with Beta Corp manager -> must fail
        res = self.client.post(
            reverse('employee-list'),
            {
                'user': str(new_user.public_id),
                'first_name': 'Cross',
                'last_name': 'Company',
                'email': 'cross@alpha.example',
                'hire_date': '2026-01-01',
                'employment_status': 'Active',
                'department': str(self.dept_a2_sales.public_id),
                'manager': str(self.emp_b1.public_id),
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('manager', res.data)

        # Same company (Alpha Corp, different branch) should succeed
        res_ok = self.client.post(
            reverse('employee-list'),
            {
                'user': str(new_user.public_id),
                'first_name': 'Same',
                'last_name': 'Company',
                'email': 'same@alpha.example',
                'hire_date': '2026-01-01',
                'employment_status': 'Active',
                'department': str(self.dept_a2_sales.public_id),
                'manager': str(self.emp_a1.public_id),
            },
            format='json',
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED, res_ok.data)

    def test_manager_flags_reflect_real_assignments(self):
        self.client.force_authenticate(self.hr_user)
        # Initially emp_a1 has Employee role, no branch, no dept head, no subordinates
        detail_url = reverse('employee-detail', kwargs={'public_id': str(self.emp_a1.public_id)})
        res1 = self.client.get(detail_url)
        self.assertFalse(res1.data['is_manager'])

        # Make emp_a1 head of Engineering department
        self.dept_a1_eng.head = self.emp_a1
        self.dept_a1_eng.save()

        res2 = self.client.get(detail_url)
        self.assertTrue(res2.data['is_department_head'])
        self.assertTrue(res2.data['is_manager'])

    def test_failed_atomic_manager_creation_leaves_no_orphaned_login(self):
        admin_user = User.objects.create_user(
            username='admin_lead',
            password='S3cure!AdminPass#93',
            email='adminlead@northstar.example',
            role=self.admin_role,
        )
        pm_role = Role.objects.create(role_name='Department / Project Manager')
        self.client.force_authenticate(admin_user)

        # Fail due to duplicate employee email -> user login must NOT be left behind
        res_dup = self.client.post(
            reverse('employee-list'),
            {
                'username': 'failed_mgr_login',
                'password': 'Strong!Password#99',
                'role': str(pm_role.public_id),
                'first_name': 'Failed',
                'last_name': 'Manager',
                'email': 'alice@alpha.example',
                'hire_date': '2026-01-01',
                'employment_status': 'Active',
                'department': str(self.dept_a1_eng.public_id),
            },
            format='json',
        )
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST, res_dup.data)
        self.assertFalse(User.objects.filter(username='failed_mgr_login').exists())

        # Fail due to missing department -> user login must NOT be left behind
        res_nodept = self.client.post(
            reverse('employee-list'),
            {
                'username': 'nodept_mgr_login',
                'password': 'Strong!Password#99',
                'role': str(pm_role.public_id),
                'first_name': 'NoDept',
                'last_name': 'Manager',
                'email': 'nodept.mgr@alpha.example',
                'hire_date': '2026-01-01',
                'employment_status': 'Active',
            },
            format='json',
        )
        self.assertEqual(res_nodept.status_code, status.HTTP_400_BAD_REQUEST, res_nodept.data)
        self.assertFalse(User.objects.filter(username='nodept_mgr_login').exists())

    def test_atomic_manager_creation_with_leadership_and_role_name(self):
        admin_user = User.objects.create_user(
            username='admin_exec',
            password='S3cure!AdminPass#93',
            email='adminexec@northstar.example',
            role=self.admin_role,
        )
        pm_role = Role.objects.create(role_name='Department / Project Manager')
        self.client.force_authenticate(admin_user)

        res = self.client.post(
            reverse('employee-list'),
            {
                'username': 'vikram_mgr',
                'password': 'Strong!Password#99',
                'role': str(pm_role.public_id),
                'first_name': 'Vikram',
                'last_name': 'Lead',
                'email': 'vikram@alpha.example',
                'hire_date': '2026-01-01',
                'employment_status': 'Active',
                'department': str(self.dept_a1_eng.public_id),
                'make_branch_manager': True,
                'make_department_head': True,
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data['role_name'], 'Department / Project Manager')
        self.assertEqual(res.data['user_details']['role_name'], 'Department / Project Manager')
        self.assertTrue(res.data['is_branch_manager'])
        self.assertTrue(res.data['is_department_head'])
        self.assertTrue(res.data['is_manager'])

        self.branch_a1.refresh_from_db()
        self.dept_a1_eng.refresh_from_db()
        self.assertEqual(str(self.branch_a1.manager.public_id), res.data['public_id'])
        self.assertEqual(str(self.dept_a1_eng.head.public_id), res.data['public_id'])

    def test_department_cannot_be_cleared_on_update(self):
        self.client.force_authenticate(self.hr_user)
        detail_url = reverse('employee-detail', kwargs={'public_id': str(self.emp_a1.public_id)})
        res = self.client.patch(
            detail_url,
            {'department': None, 'employment_status': 'Inactive'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('department', res.data)

    def test_manager_cycle_detected_more_than_one_level_deep(self):
        self.client.force_authenticate(self.hr_user)

        user_a3 = User.objects.create_user(
            username='emp_a3', password='Strong!Password#12', role=self.employee_role
        )
        emp_a3 = Employee.objects.create(
            user=user_a3,
            first_name='Carol',
            last_name='Gamma',
            email='carol@alpha.example',
            hire_date=date(2024, 3, 1),
            employment_status='Active',
            department=self.dept_a1_eng,
        )

        # Build a same-company chain: emp_a3 -> emp_a1.
        chain_url = reverse('employee-detail', kwargs={'public_id': str(emp_a3.public_id)})
        res_set_a3_manager = self.client.patch(
            chain_url,
            {'manager': str(self.emp_a1.public_id)},
            format='json',
        )
        self.assertEqual(res_set_a3_manager.status_code, status.HTTP_200_OK, res_set_a3_manager.data)

        # Make a third link so emp_a1 reports to a new employee, who reports back to emp_a3.
        user_a4 = User.objects.create_user(
            username='emp_a4', password='Strong!Password#12', role=self.employee_role
        )
        emp_a4 = Employee.objects.create(
            user=user_a4,
            first_name='Dan',
            last_name='Delta',
            email='dan@alpha.example',
            hire_date=date(2024, 4, 1),
            employment_status='Active',
            department=self.dept_a1_eng,
        )

        a1_url = reverse('employee-detail', kwargs={'public_id': str(self.emp_a1.public_id)})
        res_set_a1_manager = self.client.patch(
            a1_url,
            {'manager': str(emp_a4.public_id)},
            format='json',
        )
        self.assertEqual(res_set_a1_manager.status_code, status.HTTP_200_OK, res_set_a1_manager.data)

        # Chain is now: emp_a3 -> emp_a1 -> emp_a4. Closing the loop (emp_a4 -> emp_a3)
        # is an indirect, three-level cycle and must be rejected.
        a4_url = reverse('employee-detail', kwargs={'public_id': str(emp_a4.public_id)})
        res_cycle = self.client.patch(
            a4_url,
            {'manager': str(emp_a3.public_id)},
            format='json',
        )
        self.assertEqual(res_cycle.status_code, status.HTTP_400_BAD_REQUEST, res_cycle.data)
        self.assertIn('manager', res_cycle.data)


class EmployeeModelCleanValidationTests(TestCase):
    """
    Employee.clean() is the only guard for callers that bypass EmployeeSerializer
    (Django admin, management commands, data migrations). Exercise it directly.
    """

    def setUp(self):
        self.company_a = Company.objects.create(
            name='Alpha Corp', registration_number='REG-MODEL-A1',
            address='Alpha Address', contact_email='info@alpha-model.example',
        )
        self.company_b = Company.objects.create(
            name='Beta Corp', registration_number='REG-MODEL-B1',
            address='Beta Address', contact_email='info@beta-model.example',
        )
        self.branch_a = Branch.objects.create(company=self.company_a, name='Alpha HQ', location='NYC')
        self.branch_b = Branch.objects.create(company=self.company_b, name='Beta HQ', location='Austin')
        self.dept_a = Department.objects.create(branch=self.branch_a, name='Engineering')
        self.dept_b = Department.objects.create(branch=self.branch_b, name='Operations')

        def make_employee(suffix, department):
            user = User.objects.create_user(
                username=f'model_emp_{suffix}', password='Strong!Password#12',
            )
            return Employee.objects.create(
                user=user, first_name=suffix, last_name='Model',
                email=f'{suffix.lower()}@model.example',
                hire_date=date(2024, 1, 1), employment_status='Active',
                department=department,
            )

        self.emp_a1 = make_employee('A1', self.dept_a)
        self.emp_a2 = make_employee('A2', self.dept_a)
        self.emp_a3 = make_employee('A3', self.dept_a)
        self.emp_b1 = make_employee('B1', self.dept_b)

    def test_direct_self_reference_rejected(self):
        self.emp_a1.manager = self.emp_a1
        with self.assertRaises(ValidationError) as ctx:
            self.emp_a1.full_clean()
        self.assertIn('manager', ctx.exception.message_dict)

    def test_indirect_cycle_more_than_one_level_deep_rejected(self):
        # Chain: a2 -> a1, a3 -> a2. Closing the loop a1 -> a3 is a 3-level cycle.
        self.emp_a2.manager = self.emp_a1
        self.emp_a2.full_clean()
        self.emp_a2.save()

        self.emp_a3.manager = self.emp_a2
        self.emp_a3.full_clean()
        self.emp_a3.save()

        self.emp_a1.manager = self.emp_a3
        with self.assertRaises(ValidationError) as ctx:
            self.emp_a1.full_clean()
        self.assertIn('manager', ctx.exception.message_dict)

    def test_cross_company_manager_rejected(self):
        self.emp_a1.manager = self.emp_b1
        with self.assertRaises(ValidationError) as ctx:
            self.emp_a1.full_clean()
        self.assertIn('manager', ctx.exception.message_dict)

    def test_same_company_manager_chain_is_valid(self):
        self.emp_a2.manager = self.emp_a1
        self.emp_a2.full_clean()
        self.emp_a2.save()

        self.emp_a3.manager = self.emp_a2
        self.emp_a3.full_clean()
        self.emp_a3.save()


class EmployeeCodeTests(TestCase):
    """Phase 2: human-readable employee_code, auto-assigned on creation."""

    def setUp(self):
        company = Company.objects.create(
            name='Code Corp', registration_number='REG-CODE-001',
            address='Code Address', contact_email='info@code.example',
        )
        branch = Branch.objects.create(company=company, name='Code HQ', location='Remote')
        self.department = Department.objects.create(branch=branch, name='Payroll')

    def make_employee(self, suffix):
        user = User.objects.create_user(
            username=f'code_emp_{suffix}', password='Strong!Password#12',
        )
        return Employee.objects.create(
            user=user, first_name=suffix, last_name='Code',
            email=f'{suffix.lower()}@code.example',
            hire_date=date(2024, 1, 1), employment_status='Active',
            department=self.department,
        )

    def test_employee_code_assigned_on_creation(self):
        employee = self.make_employee('A')
        self.assertEqual(employee.employee_code, f'EMP-{employee.id:04d}')

    def test_employee_code_is_unique_and_sequential(self):
        first = self.make_employee('A')
        second = self.make_employee('B')
        self.assertNotEqual(first.employee_code, second.employee_code)
        self.assertEqual(second.employee_code, f'EMP-{second.id:04d}')

    def test_employee_code_is_stable_across_updates(self):
        employee = self.make_employee('A')
        original_code = employee.employee_code
        employee.job_title = 'Payroll Specialist'
        employee.save()
        employee.refresh_from_db()
        self.assertEqual(employee.employee_code, original_code)

    def test_employee_code_exposed_via_api(self):
        admin_role = Role.objects.create(role_name='System Admin')
        admin = User.objects.create_user(
            username='code-admin', password='S3cure!AdminPass#93', role=admin_role,
        )
        employee = self.make_employee('A')

        client = APIClient()
        client.force_authenticate(admin)
        response = client.get(
            reverse('employee-detail', kwargs={'public_id': str(employee.public_id)})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['employee_code'], employee.employee_code)


class EmployeeResignationDateApiTests(APITestCase):
    """Phase 5: resignation_date is required on separation, bounded by hire_date,
    cleared on reactivation, and blocks separation while direct reports remain."""

    def setUp(self):
        self.hr_role = Role.objects.create(role_name='HR Manager')
        self.employee_role = Role.objects.create(role_name='Employee')
        self.hr_user = User.objects.create_user(
            username='hr_resign', password='S3cure!AdminPass#93', role=self.hr_role,
        )
        company = Company.objects.create(
            name='Resign Corp', registration_number='REG-RESIGN-01',
            address='Resign Address', contact_email='info@resign.example',
        )
        branch = Branch.objects.create(company=company, name='Resign HQ', location='Remote')
        self.department = Department.objects.create(branch=branch, name='Support')

        self.user = User.objects.create_user(
            username='leaving_emp', password='Strong!Password#12', role=self.employee_role,
        )
        self.employee = Employee.objects.create(
            user=self.user, first_name='Leaving', last_name='Employee',
            email='leaving@resign.example', hire_date=date(2024, 1, 1),
            employment_status='Active', department=self.department,
        )

        sub_user = User.objects.create_user(
            username='direct_report', password='Strong!Password#12', role=self.employee_role,
        )
        self.subordinate = Employee.objects.create(
            user=sub_user, first_name='Direct', last_name='Report',
            email='report@resign.example', hire_date=date(2024, 1, 1),
            employment_status='Active', department=self.department, manager=self.employee,
        )

    def test_resignation_date_required_when_resigning(self):
        self.client.force_authenticate(self.hr_user)
        url = reverse('employee-detail', kwargs={'public_id': str(self.subordinate.public_id)})
        res = self.client.patch(url, {'employment_status': 'Resigned'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('resignation_date', res.data)

    def test_resignation_date_cannot_precede_hire_date(self):
        self.client.force_authenticate(self.hr_user)
        url = reverse('employee-detail', kwargs={'public_id': str(self.subordinate.public_id)})
        res = self.client.patch(
            url,
            {'employment_status': 'Terminated', 'resignation_date': '2023-12-01'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('resignation_date', res.data)

    def test_terminating_with_valid_date_succeeds_and_is_persisted(self):
        self.client.force_authenticate(self.hr_user)
        url = reverse('employee-detail', kwargs={'public_id': str(self.subordinate.public_id)})
        res = self.client.patch(
            url,
            {'employment_status': 'Terminated', 'resignation_date': '2026-01-15'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data['resignation_date'], '2026-01-15')

    def test_resignation_date_cleared_when_status_moves_back_to_active(self):
        self.subordinate.employment_status = 'Terminated'
        self.subordinate.resignation_date = date(2026, 1, 15)
        self.subordinate.save()

        self.client.force_authenticate(self.hr_user)
        url = reverse('employee-detail', kwargs={'public_id': str(self.subordinate.public_id)})
        res = self.client.patch(url, {'employment_status': 'Active'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertIsNone(res.data['resignation_date'])

    def test_cannot_resign_manager_with_active_direct_reports(self):
        self.client.force_authenticate(self.hr_user)
        url = reverse('employee-detail', kwargs={'public_id': str(self.employee.public_id)})
        res = self.client.patch(
            url,
            {'employment_status': 'Resigned', 'resignation_date': '2026-01-15'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('employment_status', res.data)

    def test_resigning_succeeds_once_direct_reports_are_reassigned(self):
        self.subordinate.manager = None
        self.subordinate.save()

        self.client.force_authenticate(self.hr_user)
        url = reverse('employee-detail', kwargs={'public_id': str(self.employee.public_id)})
        res = self.client.patch(
            url,
            {'employment_status': 'Resigned', 'resignation_date': '2026-01-15'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)


class EmployeeResignationDateModelCleanTests(TestCase):
    """Model.clean() is the defense-in-depth guard for callers that bypass
    EmployeeSerializer (Django admin, management commands, data migrations)."""

    def setUp(self):
        company = Company.objects.create(
            name='Resign Model Corp', registration_number='REG-RESIGN-MODEL-01',
            address='Resign Address', contact_email='info@resign-model.example',
        )
        branch = Branch.objects.create(company=company, name='Resign Model HQ', location='Remote')
        self.department = Department.objects.create(branch=branch, name='Support')
        user = User.objects.create_user(
            username='resign_model_emp', password='Strong!Password#12',
        )
        self.employee = Employee.objects.create(
            user=user, first_name='Resign', last_name='Model',
            email='resign@resign-model.example', hire_date=date(2024, 1, 1),
            employment_status='Active', department=self.department,
        )

    def test_resignation_date_required_on_full_clean(self):
        self.employee.employment_status = 'Resigned'
        with self.assertRaises(ValidationError) as ctx:
            self.employee.full_clean()
        self.assertIn('resignation_date', ctx.exception.message_dict)

    def test_resignation_date_before_hire_date_rejected(self):
        self.employee.employment_status = 'Terminated'
        self.employee.resignation_date = date(2023, 1, 1)
        with self.assertRaises(ValidationError) as ctx:
            self.employee.full_clean()
        self.assertIn('resignation_date', ctx.exception.message_dict)

    def test_resignation_date_cleared_on_reactivation(self):
        self.employee.employment_status = 'Terminated'
        self.employee.resignation_date = date(2024, 6, 1)
        self.employee.full_clean()
        self.employee.save()

        self.employee.employment_status = 'Active'
        self.employee.full_clean()
        self.assertIsNone(self.employee.resignation_date)

