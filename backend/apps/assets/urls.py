from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AssetViewSet,
    AssetAllocationViewSet,
    AssetHistoryViewSet,
)


router = DefaultRouter()

router.register(
    r'assets',
    AssetViewSet,
    basename='asset'
)

router.register(
    r'allocations',
    AssetAllocationViewSet,
    basename='asset-allocation'
)

router.register(
    r'history',
    AssetHistoryViewSet,
    basename='asset-history'
)


urlpatterns = [
    path('', include(router.urls)),
]