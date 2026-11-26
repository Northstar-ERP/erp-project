
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
