from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organization.models import Branch, Company, Department
from apps.users.models import Employee, Role, User

from .models import ReviewCycle, Scorecard


class PerformanceTestBase(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.hr_role = Role.objects.create(role_name='HR Manager')
        self.manager_role = Role.objects.create(
            role_name='Department / Project Manager'
        )
        self.employee_role = Role.objects.create(role_name='Employee')

        self.hr_user = User.objects.create_user(
            username='hr_lead',
            password='S3cure!AdminPass#93',
            role=self.hr_role,
        )

        self.company = Company.objects.create(
            name='Northstar Inc',
            registration_number='REG-NS-01',
            address='HQ',
            contact_email='info@northstar.example',
        )
        self.branch = Branch.objects.create(
            company=self.company, name='HQ Branch', location='Remote'
        )
        self.department = Department.objects.create(
            branch=self.branch, name='Engineering'
        )

        self.manager_user = User.objects.create_user(
            username='mgr_lead',
            password='Strong!Password#12',
            role=self.manager_role,
        )
        self.manager = Employee.objects.create(
            user=self.manager_user,
            first_name='Morgan',
            last_name='Lead',
            email='morgan@northstar.example',
            hire_date=date(2023, 1, 1),
            employment_status='Active',
            department=self.department,
        )

        self.report_user = User.objects.create_user(
            username='report_emp',
            password='Strong!Password#12',
            role=self.employee_role,
        )
        self.report = Employee.objects.create(
            user=self.report_user,
            first_name='Rae',
            last_name='Report',
            email='rae@northstar.example',
            hire_date=date(2023, 6, 1),
            employment_status='Active',
            department=self.department,
            manager=self.manager,
        )

        self.other_user = User.objects.create_user(
            username='other_emp',
            password='Strong!Password#12',
            role=self.employee_role,
        )
        self.other = Employee.objects.create(
            user=self.other_user,
            first_name='Owen',
            last_name='Other',
            email='owen@northstar.example',
            hire_date=date(2023, 6, 1),
            employment_status='Active',
            department=self.department,
        )

        self.cycle = ReviewCycle.objects.create(
            period_type=ReviewCycle.PeriodType.QUARTERLY,
            period_label='Q1 2026',
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
        )

    def scorecard_payload(self, employee, cycle=None, **extra):
        payload = {
            'employee': str(employee.public_id),
            'cycle': str((cycle or self.cycle).public_id),
            'goals': 'Ship the Q1 roadmap.',
        }
        payload.update(extra)
        return payload


class ScorecardCreationTests(PerformanceTestBase):
    def test_manager_can_create_scorecard_for_direct_report(self):
        self.client.force_authenticate(self.manager_user)

        response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.report),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], Scorecard.Status.DRAFT)
        self.assertEqual(str(response.data['reviewer']), str(self.manager.public_id))

    def test_manager_cannot_create_scorecard_for_non_report(self):
        self.client.force_authenticate(self.manager_user)

        response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.other),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hr_can_create_scorecard_for_any_employee(self):
        self.client.force_authenticate(self.hr_user)

        response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.other),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_employee_cannot_create_own_scorecard(self):
        self.client.force_authenticate(self.report_user)

        response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.report),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_scorecard_for_same_employee_and_cycle_rejected(self):
        self.client.force_authenticate(self.manager_user)
        self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.report),
            format='json',
        )

        response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.report),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_closed_cycle_rejects_new_scorecard(self):
        self.cycle.is_closed = True
        self.cycle.save(update_fields=['is_closed'])
        self.client.force_authenticate(self.manager_user)

        response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.report),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ScorecardSubmitTests(PerformanceTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.manager_user)
        create_response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.report),
            format='json',
        )
        self.scorecard = Scorecard.objects.get(
            public_id=create_response.data['public_id']
        )

    def submit_url(self):
        return reverse(
            'scorecard-submit', kwargs={'public_id': str(self.scorecard.public_id)}
        )

    def test_submit_requires_rating(self):
        response = self.client.post(self.submit_url())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submit_transitions_status_and_sets_submitted_at(self):
        self.client.patch(
            reverse(
                'scorecard-detail',
                kwargs={'public_id': str(self.scorecard.public_id)},
            ),
            {'rating': 4},
            format='json',
        )

        response = self.client.post(self.submit_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], Scorecard.Status.SUBMITTED)
        self.assertIsNotNone(response.data['submitted_at'])

    def test_unrelated_manager_cannot_submit(self):
        other_manager_user = User.objects.create_user(
            username='other_mgr',
            password='Strong!Password#12',
            role=self.manager_role,
        )
        Employee.objects.create(
            user=other_manager_user,
            first_name='Nora',
            last_name='Manager',
            email='nora@northstar.example',
            hire_date=date(2023, 1, 1),
            employment_status='Active',
            department=self.department,
        )
        self.client.force_authenticate(other_manager_user)

        response = self.client.post(self.submit_url())

        # The scorecard falls outside this manager's queryset entirely
        # (not their own, not one they review), so it 404s rather than 403s.
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ScorecardVisibilityTests(PerformanceTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.manager_user)
        create_response = self.client.post(
            reverse('scorecard-list'),
            self.scorecard_payload(self.report),
            format='json',
        )
        self.scorecard = Scorecard.objects.get(
            public_id=create_response.data['public_id']
        )

    def test_employee_sees_only_own_scorecard(self):
        self.client.force_authenticate(self.report_user)
        response = self.client.get(reverse('scorecard-list'))

        results = response.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['public_id'], str(self.scorecard.public_id))

    def test_unrelated_employee_cannot_see_others_scorecard(self):
        self.client.force_authenticate(self.other_user)
        response = self.client.get(reverse('scorecard-list'))

        results = response.data
        self.assertEqual(len(results), 0)


class ReviewCyclePermissionTests(PerformanceTestBase):
    def test_hr_can_create_review_cycle(self):
        self.client.force_authenticate(self.hr_user)

        response = self.client.post(
            reverse('review-cycle-list'),
            {
                'period_type': ReviewCycle.PeriodType.ANNUAL,
                'period_label': 'FY2026',
                'start_date': '2026-01-01',
                'end_date': '2026-12-31',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_manager_cannot_create_review_cycle(self):
        self.client.force_authenticate(self.manager_user)

        response = self.client.post(
            reverse('review-cycle-list'),
            {
                'period_type': ReviewCycle.PeriodType.ANNUAL,
                'period_label': 'FY2027',
                'start_date': '2027-01-01',
                'end_date': '2027-12-31',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_read_review_cycles(self):
        self.client.force_authenticate(self.manager_user)

        response = self.client.get(reverse('review-cycle-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
