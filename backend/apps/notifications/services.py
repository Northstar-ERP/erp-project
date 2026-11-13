"""Notification service layer.

Other apps call the event helpers further down (leave_submitted, task_assigned,
...). Nothing in here raises into the caller: a failed notification must never
break a business action such as approving a leave request. Failures are logged.
"""
import functools
import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Notification

logger = logging.getLogger(__name__)
Type = Notification.Type


# --------------------------------------------------------------------------
# Core
# --------------------------------------------------------------------------
def user_of(employee):
    """Employee -> active, non-deleted User, or None."""
    if employee is None:
        return None
    try:
        user = employee.user
    except ObjectDoesNotExist:
        return None
    # Forward relations use Django's base manager, so a soft-deleted user is
    # still returned here; check the flag explicitly.
    if user is None or getattr(user, 'is_deleted', False) or not user.is_active:
        return None
    return user


def manager_user_of(employee):
    """The login user of the employee's manager, or None if there is none."""
    return user_of(getattr(employee, 'manager', None) if employee else None)


def users_with_role(*role_names):
    User = get_user_model()
    return User.objects.filter(role__role_name__in=role_names, is_active=True)


def notify(recipient, notification_type, title, message, *, link='',
           related_public_id=None, actor=None, dedupe_key=''):
    """Create one notification.

    Returns the Notification, or None when it was skipped or failed:
    - no recipient (e.g. an employee without a manager)
    - the recipient is the person who did the action (no self-notifications)
    - the same dedupe_key already exists for that recipient
    """
    if recipient is None:
        return None
    actor_pk = getattr(actor, 'pk', None)
    if actor_pk is not None and recipient.pk == actor_pk:
        return None
    try:
        # The savepoint keeps a failure here from breaking the caller's transaction.
        with transaction.atomic():
            if dedupe_key and Notification.all_objects.filter(
                recipient=recipient, dedupe_key=dedupe_key
            ).exists():
                return None
            return Notification.objects.create(
                recipient=recipient,
                notification_type=notification_type,
                title=title,
                message=message,
                link=link,
                related_public_id=related_public_id,
                created_by=actor if actor_pk is not None else None,
                dedupe_key=dedupe_key,
            )
    except IntegrityError:
        return None  # lost a race with an identical notification
    except Exception:
        logger.exception('Could not create notification %r for user %s',
                         title, recipient.pk)
        return None


def notify_many(recipients, *args, **kwargs):
    """notify() for several recipients, skipping None and duplicates."""
    seen, created = set(), []
    for recipient in recipients:
        if recipient is None or recipient.pk in seen:
            continue
        seen.add(recipient.pk)
        notification = notify(recipient, *args, **kwargs)
        if notification:
            created.append(notification)
    return created


def _safe(fn):
    """Event helpers must never raise into the calling business code."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            logger.exception('Notification helper %s failed', fn.__name__)
            return None
    return wrapper


def _name(employee):
    return f'{employee.first_name} {employee.last_name}'.strip()


def _actor_name(actor):
    if actor is None:
        return 'Someone'
    return actor.get_full_name() or actor.username


# --------------------------------------------------------------------------
# Leave
# --------------------------------------------------------------------------
@_safe
def leave_submitted(leave_request, actor=None):
    """Tell the employee's manager (or HR if there is no manager)."""
    employee = leave_request.employee
    recipients = [manager_user_of(employee)]
    if recipients[0] is None:
        recipients = list(users_with_role('HR Manager'))
    return notify_many(
        recipients,
        Type.LEAVE,
        'New leave request',
        f'{_name(employee)} requested leave ({leave_request.leave_type}) '
        f'from {leave_request.start_date} to {leave_request.end_date}.',
        link='/leave',
        related_public_id=leave_request.public_id,
        actor=actor,
        dedupe_key=f'leave-submitted:{leave_request.public_id}',
    )


@_safe
def leave_reviewed(leave_request, reviewer, approved):
    """Tell the employee their request was approved or rejected."""
    decision = 'approved' if approved else 'rejected'
    message = (f'Your leave request from {leave_request.start_date} to '
               f'{leave_request.end_date} was {decision}.')
    comment = getattr(leave_request, 'reviewer_comment', '')
    if comment:
        message += f' Comment: {comment}'
    return notify(
        user_of(leave_request.employee),
        Type.LEAVE,
        f'Leave {decision}',
        message,
        link='/leave',
        related_public_id=leave_request.public_id,
        actor=reviewer,
        dedupe_key=f'leave-{decision}:{leave_request.public_id}',
    )


# --------------------------------------------------------------------------
# Performance
# --------------------------------------------------------------------------
@_safe
def performance_scorecard_submitted(scorecard, actor=None):
    """Tell the employee their performance review was submitted."""
    return notify(
        user_of(scorecard.employee),
        Type.SYSTEM,
        'Performance review submitted',
        f'Your performance review for {scorecard.cycle.period_label} has been submitted.',
        link='/performance',
        related_public_id=scorecard.public_id,
        actor=actor,
        dedupe_key=f'performance-submitted:{scorecard.public_id}',
    )


# --------------------------------------------------------------------------
# Projects and tasks
# --------------------------------------------------------------------------
@_safe
def task_assigned(task, actor=None):
    message = f'You were assigned "{task.title}" in {task.project.name}.'
    if task.deadline:
        message += f' Due {task.deadline}.'
    return notify(
        user_of(task.assigned_to),
        Type.TASK,
        'New task assigned',
        message,
        link='/projects',
        related_public_id=task.public_id,
        actor=actor,
    )


@_safe
def task_status_changed(task, old_status, actor=None):
    """Tell the project manager and the assignee, except whoever made the change."""
    recipients = [user_of(task.project.manager), user_of(task.assigned_to)]
    return notify_many(
        recipients,
        Type.TASK,
        'Task status updated',
        f'{_actor_name(actor)} moved "{task.title}" from {old_status} '
        f'to {task.status}.',
        link='/projects',
        related_public_id=task.public_id,
        actor=actor,
    )


@_safe
def project_status_changed(project, old_status, actor=None):
    """Tell everyone with a live task in the project."""
    recipients = [
        user_of(t.assigned_to)
        for t in project.tasks.filter(is_deleted=False)
        .select_related('assigned_to__user')
    ]
    return notify_many(
        recipients,
        Type.PROJECT,
        'Project status changed',
        f'"{project.name}" moved from {old_status} to {project.status}.',
        link='/projects',
        related_public_id=project.public_id,
        actor=actor,
    )


# --------------------------------------------------------------------------
# Deadlines (run by the send_deadline_reminders management command)
# --------------------------------------------------------------------------
def send_deadline_reminders(days=2, today=None):
    """Create 'due soon' and 'overdue' notifications for unfinished tasks.

    Each task gets at most one 'due soon' and one 'overdue' notification per
    deadline date, so running this every day does not spam anyone.
    Returns the number of notifications created.
    """
    from apps.projects.models import Task  # local import keeps apps decoupled

    today = today or timezone.localdate()
    horizon = today + timedelta(days=days)
    tasks = (
        Task.objects.filter(
            deadline__isnull=False,
            deadline__lte=horizon,
            assigned_to__isnull=False,
        )
        .exclude(status=Task.Status.DONE)
        .select_related('project', 'assigned_to__user')
    )

    created = 0
    for task in tasks:
        overdue = task.deadline < today
        if overdue:
            title = 'Task overdue'
            message = (f'"{task.title}" ({task.project.name}) was due on '
                       f'{task.deadline}.')
            key = f'task-overdue:{task.public_id}:{task.deadline.isoformat()}'
        else:
            title = 'Task due soon'
            message = (f'"{task.title}" ({task.project.name}) is due on '
                       f'{task.deadline}.')
            key = f'task-due:{task.public_id}:{task.deadline.isoformat()}'
        if notify(
            user_of(task.assigned_to),
            Type.DEADLINE,
            title,
            message,
            link='/projects',
            related_public_id=task.public_id,
            dedupe_key=key,
        ):
            created += 1
    return created
