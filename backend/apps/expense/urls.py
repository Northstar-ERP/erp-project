from django.urls import path
from .views import ExpenseCategoryViewSet, ExpenseViewSet

urlpatterns = [
    path(
        'categories/',
        ExpenseCategoryViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='expense-category-list',
    ),
    path(
        'categories/<uuid:public_id>/',
        ExpenseCategoryViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
            'delete': 'destroy',
        }),
        name='expense-category-detail',
    ),
    path(
        '',
        ExpenseViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='expense-list',
    ),
    path(
        '<uuid:public_id>/',
        ExpenseViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
            'delete': 'destroy',
        }),
        name='expense-detail',
    ),
    path(
        '<uuid:public_id>/approve/',
        ExpenseViewSet.as_view({'post': 'approve'}),
        name='expense-approve',
    ),
    path(
        '<uuid:public_id>/reject/',
        ExpenseViewSet.as_view({'post': 'reject'}),
        name='expense-reject',
    ),
]
