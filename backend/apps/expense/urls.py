from django.urls import path
from .views import ExpenseCategoryViewSet, ExpenseViewSet

urlpatterns = [
    path('categories/', ExpenseCategoryViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('categories/<uuid:public_id>/', ExpenseCategoryViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'})),
    path('', ExpenseViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('<uuid:public_id>/', ExpenseViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'})),
]