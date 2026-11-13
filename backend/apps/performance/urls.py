
from rest_framework.routers import DefaultRouter

from .views import ReviewCycleViewSet, ScorecardViewSet

router = DefaultRouter()

router.register("cycles", ReviewCycleViewSet, basename="review-cycle")
router.register("scorecards", ScorecardViewSet, basename="scorecard")

urlpatterns = router.urls
