from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.expense.models import Expense, ExpenseCategory
from apps.organization.models import Branch, Company, Department
from apps.users.models import Employee, Role, User


class ExpenseApiTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.hr_role = Role.objects.create(role_name='HR Manager')
        self.pm_role = Role.objects.create(role_name='Department / Project Manager')
        self.employee_role = Role.objects.create(role_name='Employee')

        self.company = Company.objects.create(
            name='Northstar Corp',
            registration_number='REG-EXP-001',
            address='100 Main St',
            contact_email='corp@northstar.example',
        )
        self.branch = Branch.objects.create(
            company=self.company,
            name='HQ Branch',
            location='NYC',
        )
        self.dept = Department.objects.create(
            branch=self.branch,
            name='Engineering',
        )

        self.admin = User.objects.create_user(
            username='exp_admin',
            password='S3cure!AdminPass#93',
            role=self.admin_role,
        )
        self.hr_user = User.objects.create_user(
            username='exp_hr',
            password='S3cure!AdminPass#93',
            role=self.hr_role,
        )
        self.mgr_user = User.objects.create_user(
            username='exp_mgr',
            password='S3cure!AdminPass#93',
            role=self.pm_role,
        )
        self.emp_user = User.objects.create_user(
            username='exp_emp',
            password='S3cure!AdminPass#93',
            role=self.employee_role,
        )
        self.other_emp_user = User.objects.create_user(
            username='exp_other_emp',
            password='S3cure!AdminPass#93',
            role=self.employee_role,
        )

        self.hr_emp = Employee.objects.create(
            user=self.hr_user,
            first_name='Hannah',
            last_name='HR',
            email='hr@northstar.example',
            hire_date=date(2024, 1, 1),
            department=self.dept,
        )
        self.mgr_emp = Employee.objects.create(
            user=self.mgr_user,
            first_name='Morgan',
            last_name='Lead',
            email='mgr@northstar.example',
            hire_date=date(2024, 1, 1),
            department=self.dept,
        )
        self.emp = Employee.objects.create(
            user=self.emp_user,
            first_name='Alex',
            last_name='Dev',
            email='alex@northstar.example',
            hire_date=date(2024, 2, 1),
            department=self.dept,
            manager=self.mgr_emp,
        )
        self.other_emp = Employee.objects.create(
            user=self.other_emp_user,
            first_name='Sam',
            last_name='Other',
            email='sam@northstar.example',
            hire_date=date(2024, 3, 1),
            department=self.dept,
        )

        self.travel_cat = ExpenseCategory.objects.create(
            name='Travel',
            description='Flights and transit',
        )
        self.emp_expense = Expense.objects.create(
            employee=self.emp,
            category=self.travel_cat,
            amount='150.00',
            expense_date=date(2026, 2, 1),
            description='Client visit cab',
            status='PENDING',
        )
        self.other_expense = Expense.objects.create(
            employee=self.other_emp,
            category=self.travel_cat,
            amount='200.00',
            expense_date=date(2026, 2, 2),
            description='Hotel stay',
            status='PENDING',
        )
        self.hr_own_expense = Expense.objects.create(
            employee=self.hr_emp,
            category=self.travel_cat,
            amount='75.00',
            expense_date=date(2026, 2, 3),
            description='HR conference pass',
            status='PENDING',
        )

    def test_expense_visibility_by_role(self):
        # HR sees all 3
        self.client.force_authenticate(self.hr_user)
        hr_list = self.client.get(reverse('expense-list'))
        self.assertEqual(hr_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(hr_list.data), 3)

        # Manager sees direct report's expense (emp_expense)
        self.client.force_authenticate(self.mgr_user)
        mgr_list = self.client.get(reverse('expense-list'))
        self.assertEqual(mgr_list.status_code, status.HTTP_200_OK)
        self.assertEqual([e['public_id'] for e in mgr_list.data], [str(self.emp_expense.public_id)])

        # Employee sees only their own
        self.client.force_authenticate(self.emp_user)
        emp_list = self.client.get(reverse('expense-list'))
        self.assertEqual(emp_list.status_code, status.HTTP_200_OK)
        self.assertEqual([e['public_id'] for e in emp_list.data], [str(self.emp_expense.public_id)])

    def test_hr_can_approve_and_reject_expenses(self):
        self.client.force_authenticate(self.hr_user)

        # Approve emp_expense
        approve_url = reverse('expense-approve', kwargs={'public_id': str(self.emp_expense.public_id)})
        res_approve = self.client.post(approve_url, {'comment': 'Receipt verified'}, format='json')
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK, res_approve.data)
        self.assertEqual(res_approve.data['status'], 'APPROVED')
        self.assertEqual(res_approve.data['remarks'], 'Receipt verified')

        self.emp_expense.refresh_from_db()
        self.assertEqual(self.emp_expense.approved_by, self.hr_user)
        self.assertIsNotNone(self.emp_expense.approved_at)

        # Re-approving non-pending must fail
        res_repeat = self.client.post(approve_url, {'comment': 'Again'}, format='json')
        self.assertEqual(res_repeat.status_code, status.HTTP_400_BAD_REQUEST)

        # Reject requires comment
        reject_url = reverse('expense-reject', kwargs={'public_id': str(self.other_expense.public_id)})
        res_no_comment = self.client.post(reject_url, {'comment': ''}, format='json')
        self.assertEqual(res_no_comment.status_code, status.HTTP_400_BAD_REQUEST)

        res_reject = self.client.post(reject_url, {'comment': 'Missing itemized receipt'}, format='json')
        self.assertEqual(res_reject.status_code, status.HTTP_200_OK, res_reject.data)
        self.assertEqual(res_reject.data['status'], 'REJECTED')
        self.assertEqual(res_reject.data['remarks'], 'Missing itemized receipt')

        # HR cannot approve own expense
        own_approve_url = reverse('expense-approve', kwargs={'public_id': str(self.hr_own_expense.public_id)})
        res_self = self.client.post(own_approve_url, {}, format='json')
        self.assertEqual(res_self.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_cannot_approve_or_edit_approved_expense(self):
        # Employee cannot approve
        self.client.force_authenticate(self.emp_user)
        approve_other = reverse('expense-approve', kwargs={'public_id': str(self.other_expense.public_id)})
        res_forbidden = self.client.post(approve_other, {}, format='json')
        self.assertIn(res_forbidden.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        approve_own = reverse('expense-approve', kwargs={'public_id': str(self.emp_expense.public_id)})
        res_own_forbidden = self.client.post(approve_own, {}, format='json')
        self.assertEqual(res_own_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Employee can edit their own PENDING expense
        detail_url = reverse('expense-detail', kwargs={'public_id': str(self.emp_expense.public_id)})
        res_edit_pending = self.client.patch(detail_url, {'amount': '160.00'}, format='json')
        self.assertEqual(res_edit_pending.status_code, status.HTTP_200_OK, res_edit_pending.data)

        # Direct manager approves emp_expense
        self.client.force_authenticate(self.mgr_user)
        res_mgr_approve = self.client.post(approve_own, {'comment': 'Approved by manager'}, format='json')
        self.assertEqual(res_mgr_approve.status_code, status.HTTP_200_OK, res_mgr_approve.data)

        # Employee cannot edit or delete APPROVED expense
        self.client.force_authenticate(self.emp_user)
        res_edit_approved = self.client.patch(detail_url, {'amount': '999.00'}, format='json')
        self.assertEqual(res_edit_approved.status_code, status.HTTP_400_BAD_REQUEST)
        res_del_approved = self.client.delete(detail_url)
        self.assertEqual(res_del_approved.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expense_category_permissions(self):
        cat_list_url = reverse('expense-category-list')

        # Employee can read but cannot create category
        self.client.force_authenticate(self.emp_user)
        self.assertEqual(self.client.get(cat_list_url).status_code, status.HTTP_200_OK)
        res_emp_create = self.client.post(cat_list_url, {'name': 'Meals'}, format='json')
        self.assertEqual(res_emp_create.status_code, status.HTTP_403_FORBIDDEN)

        # HR Manager can create, edit, and soft-delete category
        self.client.force_authenticate(self.hr_user)
        res_hr_create = self.client.post(
            cat_list_url,
            {'name': 'Meals', 'description': 'Client meals'},
            format='json',
        )
        self.assertEqual(res_hr_create.status_code, status.HTTP_201_CREATED, res_hr_create.data)
        cat_id = res_hr_create.data['public_id']

        cat_detail_url = reverse('expense-category-detail', kwargs={'public_id': cat_id})
        res_hr_patch = self.client.patch(cat_detail_url, {'name': 'Meals & Dining'}, format='json')
        self.assertEqual(res_hr_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(res_hr_patch.data['name'], 'Meals & Dining')

        res_hr_del = self.client.delete(cat_detail_url)
        self.assertEqual(res_hr_del.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ExpenseCategory.objects.filter(public_id=cat_id).exists())

