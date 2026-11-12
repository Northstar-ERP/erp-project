from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RoleViewSet,
    UserViewSet,
    EmployeeViewSet,
    InviteEmployeeView,
    AccountActivationView,
    LoginThrottledView,
    RefreshThrottledView,
)
from .serializers import CustomTokenObtainPairSerializer

router = DefaultRouter()
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'users', UserViewSet, basename='user')
router.register(r'employees', EmployeeViewSet, basename='employee')

urlpatterns = [
    path('invite/', InviteEmployeeView.as_view(), name='invite_employee'),
    path('activate/', AccountActivationView.as_view(), name='account_activation'),
    path('', include(router.urls)),
    path('auth/token/', LoginThrottledView.as_view(serializer_class=CustomTokenObtainPairSerializer), name='token_obtain_pair'),
    path('auth/token/refresh/', RefreshThrottledView.as_view(), name='token_refresh'),
]
