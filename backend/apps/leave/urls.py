
from rest_framework.routers import DefaultRouter

from .views import (
    LeaveTypeViewSet,
    LeavePolicyViewSet,
    LeaveRequestViewSet,
    LeaveBalanceViewSet,
)

router = DefaultRouter()

router.register("types", LeaveTypeViewSet, basename="leave-type")
router.register("policies", LeavePolicyViewSet, basename="leave-policy")
router.register("requests", LeaveRequestViewSet, basename="leave-request")
router.register("balances", LeaveBalanceViewSet, basename="leave-balance")

urlpatterns = router.urls
