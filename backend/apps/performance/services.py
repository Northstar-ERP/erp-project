
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Scorecard
from .permissions import get_employee, is_hr_or_admin, is_manager


def can_manage_scorecard(user, scorecard):
    if is_hr_or_admin(user):
        return True

    employee = get_employee(user)

    return bool(
        employee
        and is_manager(user)
        and scorecard.reviewer_id == employee.pk
    )


@transaction.atomic
def submit_scorecard(scorecard, actor):
    scorecard = (
        Scorecard.objects.select_for_update(of=("self",))
        .select_related("cycle")
        .get(pk=scorecard.pk)
    )

    if scorecard.status != Scorecard.Status.DRAFT:
        raise ValidationError("Only draft scorecards can be submitted.")

    if not can_manage_scorecard(actor, scorecard):
        raise ValidationError(
            "You are not authorized to submit this scorecard."
        )

    if scorecard.cycle.is_closed:
        raise ValidationError("This review cycle is closed.")

    if scorecard.rating is None:
        raise ValidationError("A rating is required before submitting.")

    scorecard.status = Scorecard.Status.SUBMITTED
    scorecard.submitted_at = timezone.now()
    scorecard.save(update_fields=["status", "submitted_at"])
    return scorecard
