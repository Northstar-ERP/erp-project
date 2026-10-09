from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CompanyViewSet, BranchViewSet, DepartmentViewSet, TeamViewSet

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='company')
router.register(r'branches', BranchViewSet, basename='branch')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'teams', TeamViewSet, basename='team')

urlpatterns = [
    path('', include(router.urls)),
]