from datetime import date
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organization.models import Branch, Company, Department
from apps.users.models import Employee, Role, User


class OrganizationLeadershipValidationTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.hr_role = Role.objects.create(role_name='HR Manager')
        self.employee_role = Role.objects.create(role_name='Employee')

        self.admin = User.objects.create_user(
            username='org_admin',
            password='S3cure!AdminPass#93',
            role=self.admin_role,
        )
        self.client.force_authenticate(self.admin)

        self.company = Company.objects.create(
            name='Northstar Global',
            registration_number='REG-ORG-999',
            address='HQ Avenue',
            contact_email='hq@northstar.example',
        )
        self.branch_1 = Branch.objects.create(
            company=self.company, name='Pune Branch', location='Pune'
        )
        self.branch_2 = Branch.objects.create(
            company=self.company, name='Mumbai Branch', location='Mumbai'
        )
        self.dept_pune_eng = Department.objects.create(
            branch=self.branch_1, name='Pune Engineering'
        )
        self.dept_pune_hr = Department.objects.create(
            branch=self.branch_1, name='Pune HR'
        )
        self.dept_mumbai_fin = Department.objects.create(
            branch=self.branch_2, name='Mumbai Finance'
        )

        u1 = User.objects.create_user(
            username='pune_eng_emp', password='Strong!Password#12', role=self.employee_role
        )
        self.emp_pune_eng = Employee.objects.create(
            user=u1,
            first_name='Rohan',
            last_name='Pune',
            email='rohan@northstar.example',
            hire_date=date(2024, 1, 10),
            employment_status='Active',
            department=self.dept_pune_eng,
        )

        u2 = User.objects.create_user(
            username='mumbai_fin_emp', password='Strong!Password#12', role=self.employee_role
        )
        self.emp_mumbai_fin = Employee.objects.create(
            user=u2,
            first_name='Kabir',
            last_name='Mumbai',
            email='kabir@northstar.example',
            hire_date=date(2024, 1, 10),
            employment_status='Active',
            department=self.dept_mumbai_fin,
        )

    def test_branch_manager_must_work_in_that_branch(self):
        branch_1_url = reverse('branch-detail', kwargs={'public_id': str(self.branch_1.public_id)})

        # Try assigning Mumbai employee as Pune Branch Manager -> must fail
        res_fail = self.client.patch(
            branch_1_url,
            {'manager': str(self.emp_mumbai_fin.public_id)},
            format='json',
        )
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST, res_fail.data)
        self.assertIn('manager', res_fail.data)

        # Assigning Pune employee as Pune Branch Manager -> must succeed
        res_ok = self.client.patch(
            branch_1_url,
            {'manager': str(self.emp_pune_eng.public_id)},
            format='json',
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK, res_ok.data)
        self.assertEqual(res_ok.data['manager_name'], 'Rohan Pune')

    def test_department_head_must_belong_to_that_department(self):
        dept_hr_url = reverse(
            'department-detail', kwargs={'public_id': str(self.dept_pune_hr.public_id)}
        )

        # Try assigning Pune Engineering employee as Head of Pune HR -> must fail
        res_fail = self.client.patch(
            dept_hr_url,
            {'head': str(self.emp_pune_eng.public_id)},
            format='json',
        )
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST, res_fail.data)
        self.assertIn('head', res_fail.data)

        # Assigning Pune Engineering employee as Head of Pune Engineering -> must succeed
        dept_eng_url = reverse(
            'department-detail', kwargs={'public_id': str(self.dept_pune_eng.public_id)}
        )
        res_ok = self.client.patch(
            dept_eng_url,
            {'head': str(self.emp_pune_eng.public_id)},
            format='json',
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK, res_ok.data)
        self.assertEqual(res_ok.data['head_name'], 'Rohan Pune')

    def test_cannot_move_department_head_out_of_department(self):
        # Assign emp_pune_eng as head of dept_pune_eng
        self.dept_pune_eng.head = self.emp_pune_eng
        self.dept_pune_eng.save()

        emp_url = reverse(
            'employee-detail', kwargs={'public_id': str(self.emp_pune_eng.public_id)}
        )
        res = self.client.patch(
            emp_url,
            {'department': str(self.dept_pune_hr.public_id)},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('department', res.data)

    def test_cannot_move_branch_manager_out_of_branch(self):
        self.branch_1.manager = self.emp_pune_eng
        self.branch_1.save()

        emp_url = reverse(
            'employee-detail', kwargs={'public_id': str(self.emp_pune_eng.public_id)}
        )
        res = self.client.patch(
            emp_url,
            {'department': str(self.dept_mumbai_fin.public_id)},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('department', res.data)

    def test_seed_erp_leadership_consistency(self):
        out = StringIO()
        db_name = connection.settings_dict.get('NAME') or ':memory:'
        with (
            patch.dict(connection.settings_dict, {'NAME': db_name, 'HOST': 'test-sqlite'}),
            patch('apps.utils.management.commands.seed_erp.Command._write_credentials'),
        ):
            call_command(
                'seed_erp',
                confirm=True,
                expected_database=db_name,
                expected_host='test-sqlite',
                stdout=out,
            )

        branches = Branch.objects.filter(is_deleted=False)
        self.assertGreaterEqual(branches.count(), 3)
        for branch in branches:
            if branch.manager:
                self.assertEqual(branch.manager.branch, branch)

        departments = Department.objects.filter(is_deleted=False)
        self.assertGreaterEqual(departments.count(), 4)
        for dept in departments:
            if dept.head:
                self.assertEqual(dept.head.department, dept)

        for emp in Employee.objects.filter(is_deleted=False):
            emp.full_clean()
            if emp.manager and emp.company and emp.manager.company:
                self.assertEqual(emp.company, emp.manager.company)

    def test_delete_organization_blocks_with_employees_and_succeeds_when_empty(self):
        # Organization with active employees cannot be deleted
        company_url = reverse('company-detail', kwargs={'public_id': str(self.company.public_id)})
        res_blocked = self.client.delete(company_url)
        self.assertEqual(res_blocked.status_code, status.HTTP_400_BAD_REQUEST, res_blocked.data)

        # Create a separate organization with an empty branch and department
        temp_company = Company.objects.create(
            name='Temp Org',
            registration_number='REG-TEMP-001',
            address='Temp Road',
            contact_email='temp@northstar.example',
        )
        temp_branch = Branch.objects.create(
            company=temp_company, name='Temp Branch', location='Delhi'
        )
        temp_dept = Department.objects.create(
            branch=temp_branch, name='Temp Dept'
        )

        temp_url = reverse('company-detail', kwargs={'public_id': str(temp_company.public_id)})
        res_ok = self.client.delete(temp_url)
        self.assertEqual(res_ok.status_code, status.HTTP_204_NO_CONTENT, res_ok.data)

        self.assertFalse(Company.objects.filter(public_id=temp_company.public_id).exists())
        self.assertFalse(Branch.objects.filter(public_id=temp_branch.public_id).exists())
        self.assertFalse(Department.objects.filter(public_id=temp_dept.public_id).exists())

    def test_cannot_move_department_out_of_branch_while_its_branch_manager_belongs_to_it(self):
        self.branch_1.manager = self.emp_pune_eng
        self.branch_1.save()

        dept_eng_url = reverse(
            'department-detail', kwargs={'public_id': str(self.dept_pune_eng.public_id)}
        )
        res = self.client.patch(
            dept_eng_url,
            {'branch': str(self.branch_2.public_id)},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('branch', res.data)

        # Model-level clean() enforces the same rule for writes that bypass the serializer
        self.dept_pune_eng.branch = self.branch_2
        with self.assertRaises(Exception):
            self.dept_pune_eng.full_clean()

        # A department with no branch manager in it can still be moved freely
        dept_hr_url = reverse(
            'department-detail', kwargs={'public_id': str(self.dept_pune_hr.public_id)}
        )
        res_ok = self.client.patch(
            dept_hr_url,
            {'branch': str(self.branch_2.public_id)},
            format='json',
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK, res_ok.data)

    def test_soft_deleting_branch_manager_or_department_head_clears_the_link(self):
        self.branch_1.manager = self.emp_pune_eng
        self.branch_1.save()
        self.dept_pune_eng.head = self.emp_pune_eng
        self.dept_pune_eng.save()

        emp_url = reverse(
            'employee-detail', kwargs={'public_id': str(self.emp_pune_eng.public_id)}
        )
        res = self.client.delete(emp_url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT, res.data)

        self.branch_1.refresh_from_db()
        self.dept_pune_eng.refresh_from_db()
        self.assertIsNone(self.branch_1.manager_id)
        self.assertIsNone(self.dept_pune_eng.head_id)


class OrganizationPermissionScopingTests(APITestCase):
    """HR Managers can read the company/branch hierarchy to assign employees into it,
    but only System Admins may restructure it (create/rename/delete companies or branches).
    """

    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.hr_role = Role.objects.create(role_name='HR Manager')

        self.hr_user = User.objects.create_user(
            username='org_hr', password='S3cure!HrPass#93', role=self.hr_role,
        )
        self.client.force_authenticate(self.hr_user)

        self.company = Company.objects.create(
            name='Northstar Global',
            registration_number='REG-SCOPE-001',
            address='HQ Avenue',
            contact_email='hq@northstar.example',
        )
        self.branch = Branch.objects.create(
            company=self.company, name='Pune Branch', location='Pune'
        )

    def test_hr_manager_can_read_but_not_create_or_delete_companies(self):
        companies_url = reverse('company-list')
        self.assertEqual(self.client.get(companies_url).status_code, status.HTTP_200_OK)

        res_create = self.client.post(
            companies_url,
            {
                'name': 'Rogue Org',
                'registration_number': 'REG-ROGUE-001',
                'address': 'Nowhere',
                'contact_email': 'rogue@example.com',
            },
            format='json',
        )
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN, res_create.data)

        company_url = reverse('company-detail', kwargs={'public_id': str(self.company.public_id)})
        res_delete = self.client.delete(company_url)
        self.assertEqual(res_delete.status_code, status.HTTP_403_FORBIDDEN, res_delete.data)

    def test_hr_manager_can_read_but_not_create_or_delete_branches(self):
        branches_url = reverse('branch-list')
        self.assertEqual(self.client.get(branches_url).status_code, status.HTTP_200_OK)

        res_create = self.client.post(
            branches_url,
            {'company': str(self.company.public_id), 'name': 'Rogue Branch', 'location': 'Nowhere'},
            format='json',
        )
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN, res_create.data)

        branch_url = reverse('branch-detail', kwargs={'public_id': str(self.branch.public_id)})
        res_delete = self.client.delete(branch_url)
        self.assertEqual(res_delete.status_code, status.HTTP_403_FORBIDDEN, res_delete.data)

    def test_system_admin_can_create_and_delete_companies_and_branches(self):
        admin = User.objects.create_user(
            username='org_admin_scope', password='S3cure!AdminPass#93', role=self.admin_role,
        )
        self.client.force_authenticate(admin)

        companies_url = reverse('company-list')
        res_create = self.client.post(
            companies_url,
            {
                'name': 'New Org',
                'registration_number': 'REG-NEW-001',
                'address': 'Somewhere',
                'contact_email': 'new@example.com',
            },
            format='json',
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED, res_create.data)


