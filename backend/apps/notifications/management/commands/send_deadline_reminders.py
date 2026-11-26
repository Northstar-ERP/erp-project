from django.core.management.base import BaseCommand

from apps.notifications.services import send_deadline_reminders


class Command(BaseCommand):
    help = 'Create "due soon" and "overdue" notifications for task deadlines.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days', type=int, default=2,
            help='Remind about tasks due within this many days (default 2).',
        )

    def handle(self, *args, **options):
        created = send_deadline_reminders(days=options['days'])
        self.stdout.write(self.style.SUCCESS(f'Created {created} reminder(s).'))
