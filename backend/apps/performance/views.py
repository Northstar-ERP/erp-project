
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.notifications.services import performance_scorecard_submitted

from apps.utils.views import AuditModelViewSet
from apps.utils.cache import CacheableModelMixin, MASTER_DATA_TTL
from apps.utils.throttling import WriteBurstThrottle

from .models import ReviewCycle, Scorecard
from .serializers import ReviewCycleSerializer, ScorecardSerializer
from .permissions import (
    IsHRAdminOrReadOnly,
    CanManageScorecard,
    get_employee,
    is_hr_or_admin,
    is_manager,
)
from .services import submit_scorecard


class ReviewCycleViewSet(CacheableModelMixin, AuditModelViewSet):
    queryset = ReviewCycle.objects.select_related("created_by").all()
    serializer_class = ReviewCycleSerializer
    permission_classes = [IsHRAdminOrReadOnly]
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ["list", "retrieve"]


class ScorecardViewSet(AuditModelViewSet):
    serializer_class = ScorecardSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    throttle_classes = [WriteBurstThrottle]

    def get_queryset(self):
        queryset = Scorecard.objects.select_related(
            "created_by",
            "employee",
            "employee__user",
            "employee__manager",
            "reviewer",
            "reviewer__user",
            "cycle",
        ).prefetch_related("metrics")

        if is_hr_or_admin(self.request.user):
            return queryset

        employee = get_employee(self.request.user)

        if not employee:
            return queryset.none()

        if is_manager(self.request.user):
            return (
                queryset.filter(employee__manager=employee)
                | queryset.filter(reviewer=employee)
                | queryset.filter(employee=employee)
            )

        return queryset.filter(employee=employee)

    def get_permissions(self):
        if self.action in {"update", "partial_update", "destroy", "submit"}:
            return [IsAuthenticated(), CanManageScorecard()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def submit(self, request, public_id=None):
        scorecard = self.get_object()
        updated_scorecard = submit_scorecard(scorecard, actor=request.user)
        performance_scorecard_submitted(updated_scorecard, actor=request.user)

        return Response(
            self.get_serializer(updated_scorecard).data,
            status=status.HTTP_200_OK,
        )
