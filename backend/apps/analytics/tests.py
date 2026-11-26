
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class AnalyticsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/analytics/summary/"

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 401)

    def test_user_without_admin_or_hr_role_is_forbidden(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="analytics_plain_user",
            password="TestPassword123!",
        )
        self.client.force_authenticate(user=user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 403)

    def test_admin_request_returns_analytics(self):
        from apps.users.models import Role

        User = get_user_model()
        user = User.objects.create_user(
            username="analytics_test_user",
            password="TestPassword123!",
            role=Role.objects.create(role_name="System Admin"),
        )
        self.client.force_authenticate(user=user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("totals", data)
        self.assertIn("projects_by_status", data)
        self.assertIn("tasks_by_status", data)
        self.assertIn("assets_by_status", data)
        self.assertIn("expense_totals", data)
        self.assertIn("leave_totals", data)
        self.assertIn("monthly_analytics", data)
