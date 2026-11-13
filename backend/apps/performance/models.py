
from django.db import models
from django.db.models import F, Q

from apps.users.models import Employee
from apps.utils.models import AuditBaseModel


class ReviewCycle(AuditBaseModel):
    """A recurring window (quarter/year) in which employees are scored."""

    class PeriodType(models.TextChoices):
        QUARTERLY = "QUARTERLY", "Quarterly"
        ANNUAL = "ANNUAL", "Annual"

    period_type = models.CharField(max_length=20, choices=PeriodType.choices)
    period_label = models.CharField(max_length=100, unique=True)
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)

    class Meta(AuditBaseModel.Meta):
        abstract = False
        ordering = ["-start_date"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F("start_date")),
                name="review_cycle_valid_date_range",
            ),
        ]

    def __str__(self):
        return self.period_label


class Scorecard(AuditBaseModel):
    """One employee's performance review for one cycle."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"

    class Rating(models.IntegerChoices):
        UNSATISFACTORY = 1, "1 - Unsatisfactory"
        NEEDS_IMPROVEMENT = 2, "2 - Needs Improvement"
        MEETS_EXPECTATIONS = 3, "3 - Meets Expectations"
        EXCEEDS_EXPECTATIONS = 4, "4 - Exceeds Expectations"
        OUTSTANDING = 5, "5 - Outstanding"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="scorecards",
    )
    cycle = models.ForeignKey(
        ReviewCycle,
        on_delete=models.PROTECT,
        related_name="scorecards",
    )
    reviewer = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_scorecards",
    )
    goals = models.TextField(blank=True)
    rating = models.PositiveSmallIntegerField(
        choices=Rating.choices, null=True, blank=True
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta(AuditBaseModel.Meta):
        abstract = False
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "cycle"],
                name="unique_employee_cycle_scorecard",
            ),
        ]

    def __str__(self):
        return f"{self.employee} - {self.cycle} ({self.status})"


class PerformanceMetric(AuditBaseModel):
    """Optional weighted goal-tracking line item under a scorecard."""

    scorecard = models.ForeignKey(
        Scorecard,
        on_delete=models.CASCADE,
        related_name="metrics",
    )
    metric_name = models.CharField(max_length=200)
    target = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    actual = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Percentage weight (0-100) this metric contributes to the overall score.
    weight = models.PositiveSmallIntegerField(default=0)

    class Meta(AuditBaseModel.Meta):
        abstract = False
        constraints = [
            models.CheckConstraint(
                condition=Q(weight__gte=0) & Q(weight__lte=100),
                name="performance_metric_weight_range",
            ),
        ]

    def __str__(self):
        return f"{self.scorecard} - {self.metric_name}"
