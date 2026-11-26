from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Notification
from .services import notify, send_deadline_reminders

User = get_user_model()
BASE = '/api/notifications/'


def make_user(username):
    return User.objects.create_user(username=username, password='pass12345')


def make_notification(user, title='Hello'):
    return Notification.objects.create(
        recipient=user,
        notification_type=Notification.Type.SYSTEM,
        title=title,
        message='message',
    )


class NotifyServiceTests(TestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.bob = make_user('bob')

    def test_creates_notification(self):
        n = notify(self.alice, Notification.Type.SYSTEM, 'Hi', 'Body')
        self.assertIsNotNone(n)
        self.assertEqual(n.recipient, self.alice)
        self.assertFalse(n.is_read)

    def test_no_recipient_is_skipped(self):
        self.assertIsNone(notify(None, Notification.Type.SYSTEM, 'Hi', 'Body'))
        self.assertEqual(Notification.objects.count(), 0)

    def test_own_action_does_not_notify_yourself(self):
        n = notify(self.alice, Notification.Type.SYSTEM, 'Hi', 'Body',
                   actor=self.alice)
        self.assertIsNone(n)

    def test_actor_is_stored_as_created_by(self):
        n = notify(self.alice, Notification.Type.SYSTEM, 'Hi', 'Body',
                   actor=self.bob)
        self.assertEqual(n.created_by, self.bob)

    def test_dedupe_key_prevents_duplicates(self):
        first = notify(self.alice, Notification.Type.SYSTEM, 'Hi', 'Body',
                       dedupe_key='k1')
        second = notify(self.alice, Notification.Type.SYSTEM, 'Hi', 'Body',
                        dedupe_key='k1')
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(Notification.objects.filter(recipient=self.alice).count(), 1)

    def test_same_dedupe_key_for_different_users_is_allowed(self):
        self.assertIsNotNone(notify(self.alice, Notification.Type.SYSTEM, 'Hi', 'B',
                                    dedupe_key='k1'))
        self.assertIsNotNone(notify(self.bob, Notification.Type.SYSTEM, 'Hi', 'B',
                                    dedupe_key='k1'))


class NotificationApiTests(TestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.bob = make_user('bob')
        self.a1 = make_notification(self.alice, 'A1')
        self.a2 = make_notification(self.alice, 'A2')
        self.b1 = make_notification(self.bob, 'B1')
        self.client = APIClient()
        self.client.force_authenticate(self.alice)

    def test_requires_login(self):
        res = APIClient().get(BASE)
        self.assertEqual(res.status_code, 401)

    def test_list_returns_only_own(self):
        res = self.client.get(BASE)
        self.assertEqual(res.status_code, 200)
        self.assertEqual({n['title'] for n in res.data}, {'A1', 'A2'})

    def test_cannot_open_someone_elses_notification(self):
        res = self.client.get(f'{BASE}{self.b1.public_id}/')
        self.assertEqual(res.status_code, 404)

    def test_cannot_mark_someone_elses_notification_read(self):
        res = self.client.post(f'{BASE}{self.b1.public_id}/read/')
        self.assertEqual(res.status_code, 404)
        self.b1.refresh_from_db()
        self.assertFalse(self.b1.is_read)

    def test_mark_one_read(self):
        res = self.client.post(f'{BASE}{self.a1.public_id}/read/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['is_read'])
        self.a1.refresh_from_db()
        self.assertIsNotNone(self.a1.read_at)

    def test_unread_count(self):
        self.assertEqual(self.client.get(f'{BASE}unread-count/').data['count'], 2)
        self.client.post(f'{BASE}{self.a1.public_id}/read/')
        self.assertEqual(self.client.get(f'{BASE}unread-count/').data['count'], 1)

    def test_mark_all_read_only_affects_own(self):
        res = self.client.post(f'{BASE}mark-all-read/')
        self.assertEqual(res.data['updated'], 2)
        self.b1.refresh_from_db()
        self.assertFalse(self.b1.is_read)

    def test_filter_by_is_read(self):
        self.client.post(f'{BASE}{self.a1.public_id}/read/')
        unread = self.client.get(f'{BASE}?is_read=false')
        self.assertEqual({n['title'] for n in unread.data}, {'A2'})

    def test_dismiss_is_a_soft_delete(self):
        res = self.client.delete(f'{BASE}{self.a1.public_id}/')
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Notification.objects.filter(pk=self.a1.pk).exists())
        self.assertTrue(Notification.all_objects.filter(pk=self.a1.pk).exists())


class DeadlineReminderTests(TestCase):
    """If setup fails with a missing-field error, Project or Task gained a
    required field after the merge: add it in setUp."""

    def setUp(self):
        from apps.projects.models import Project, Task
        from apps.users.models import Employee

        self.Task = Task
        user = make_user('carol')
        employee = Employee.objects.create(
            user=user, first_name='Carol', last_name='Diaz',
            email='carol@example.com', hire_date=date(2025, 1, 1),
        )
        project = Project.objects.create(name='Project X', start_date=date(2026, 1, 1))
        self.today = timezone.localdate()

        def task(title, deadline, status=Task.Status.TODO):
            return Task.objects.create(
                project=project, assigned_to=employee, title=title,
                deadline=deadline, status=status,
            )

        task('Soon', self.today + timedelta(days=1))
        task('Late', self.today - timedelta(days=3))
        task('Finished', self.today, status=Task.Status.DONE)
        task('Far away', self.today + timedelta(days=30))
        self.user = user

    def test_only_unfinished_tasks_near_or_past_deadline(self):
        created = send_deadline_reminders(days=2, today=self.today)
        self.assertEqual(created, 2)
        titles = set(Notification.objects.filter(recipient=self.user)
                     .values_list('title', flat=True))
        self.assertEqual(titles, {'Task due soon', 'Task overdue'})

    def test_running_twice_does_not_duplicate(self):
        send_deadline_reminders(days=2, today=self.today)
        self.assertEqual(send_deadline_reminders(days=2, today=self.today), 0)
