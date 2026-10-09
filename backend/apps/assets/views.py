from django.db import transaction
from django.utils import timezone

from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Asset, AssetAllocation, AssetHistory
from .serializers import (
    AssetSerializer,
    AssetAllocationSerializer,
    AssetHistorySerializer,
)

ASSET_MANAGER_ROLES = ['System Admin', 'IT']


class AssetPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated

        if not request.user or not request.user.is_authenticated:
            return False
        role_name = getattr(getattr(request.user, 'role', None), 'role_name', None)
        return request.user.is_superuser or role_name in ASSET_MANAGER_ROLES


class AssetViewSet(viewsets.ModelViewSet):
    serializer_class = AssetSerializer
    permission_classes = [AssetPermission]
    lookup_field = 'public_id'

    def get_queryset(self):
        user = self.request.user
        queryset = Asset.objects.all().order_by('-id')

        role_name = getattr(getattr(user, 'role', None), 'role_name', None)
        if user.is_superuser or role_name in ASSET_MANAGER_ROLES:
            return queryset

        if role_name in [
            'Employee',
            'Department / Project Manager',
            'HR Manager',
        ]:
            return queryset.filter(
                allocations__employee__user=user,
                allocations__status=AssetAllocation.Status.ALLOCATED,
                status=Asset.Status.ALLOCATED,
            ).distinct()

        return queryset.none()

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        if 'status' in self.request.data:
            raise ValidationError(
                "Asset status cannot be changed directly. "
                "Use the asset status or allocation endpoint."
            )
        serializer.save()

    @action(detail=True, methods=['patch'], url_path='status')
    @transaction.atomic
    def change_status(self, request, public_id=None):
        asset = self.get_object()
        asset = Asset.objects.select_for_update().get(pk=asset.pk)

        if set(request.data.keys()) != {'status'}:
            raise ValidationError({
                'status': 'Provide only the new asset status.'
            })

        new_status = request.data['status']
        if new_status not in Asset.Status.values:
            raise ValidationError({'status': 'Invalid asset status.'})
        if new_status == Asset.Status.ALLOCATED:
            raise ValidationError({
                'status': 'Use the allocation endpoint to allocate an asset.'
            })
        if new_status == asset.status:
            return Response(self.get_serializer(asset).data)
        if asset.status == Asset.Status.ALLOCATED or AssetAllocation.objects.filter(
            asset=asset,
            status=AssetAllocation.Status.ALLOCATED,
        ).exists():
            raise ValidationError(
                'Return the active allocation before changing asset status.'
            )

        old_status = asset.status
        asset.status = new_status
        asset.save(update_fields=['status'])
        AssetHistory.objects.create(
            asset=asset,
            event_type='Status Changed',
            event_date=timezone.now(),
            remarks=f"Status changed from {old_status} to {new_status}.",
        )
        return Response(self.get_serializer(asset).data)


class AssetAllocationViewSet(viewsets.ModelViewSet):
    queryset = AssetAllocation.objects.select_related(
        'asset',
        'employee'
    ).order_by('-id')

    serializer_class = AssetAllocationSerializer
    permission_classes = [AssetPermission]
    lookup_field = 'public_id'

    def get_queryset(self):
        queryset = super().get_queryset()

        user = self.request.user

        role_name = getattr(
            getattr(user, 'role', None),
            'role_name',
            None
        )

        # System Admin and HR Manager can see all allocations
        if user.is_superuser or role_name in ASSET_MANAGER_ROLES:
            return queryset

        if role_name in [
            'Employee',
            'Department / Project Manager',
            'HR Manager',
        ]:
            return queryset.filter(employee__user=user)
        return queryset.none()

    @transaction.atomic
    def perform_create(self, serializer):
        requested_asset = serializer.validated_data['asset']
        asset = Asset.objects.select_for_update().get(pk=requested_asset.pk)

        if asset.status != Asset.Status.AVAILABLE:
            raise ValidationError(
                "This asset is not available for allocation."
            )

        allocation = serializer.save(
            asset=asset,
            status=AssetAllocation.Status.ALLOCATED,
        )

        asset.status = Asset.Status.ALLOCATED
        asset.save(update_fields=['status'])

        AssetHistory.objects.create(
            asset=asset,
            employee=allocation.employee,
            event_type='Allocated',
            event_date=timezone.now(),
            remarks=f"Asset allocated to {allocation.employee}."
        )

    @transaction.atomic
    def perform_update(self, serializer):
        allocation = AssetAllocation.objects.select_for_update().get(
            pk=serializer.instance.pk
        )
        serializer.instance = allocation
        was_allocated = allocation.status == AssetAllocation.Status.ALLOCATED
        allocation = serializer.save()

        if (
            allocation.status == AssetAllocation.Status.RETURNED
            or allocation.return_date is not None
        ):
            if allocation.return_date is None:
                allocation.return_date = timezone.now().date()
            allocation.status = AssetAllocation.Status.RETURNED
            allocation.save(
                update_fields=['return_date', 'status']
            )

            if was_allocated:
                asset = Asset.objects.select_for_update().get(
                    pk=allocation.asset_id
                )
                other_active_allocations = AssetAllocation.objects.filter(
                    asset=asset,
                    status=AssetAllocation.Status.ALLOCATED,
                ).exclude(pk=allocation.pk)
                if not other_active_allocations.exists():
                    asset.status = Asset.Status.AVAILABLE
                    asset.save(update_fields=['status'])

                AssetHistory.objects.create(
                    asset=asset,
                    employee=allocation.employee,
                    event_type='Returned',
                    event_date=timezone.now(),
                    remarks=f"Asset returned by {allocation.employee}."
                )

    @transaction.atomic
    def perform_destroy(self, instance):
        allocation = AssetAllocation.objects.select_for_update().get(
            pk=instance.pk
        )
        if allocation.status == AssetAllocation.Status.ALLOCATED:
            asset = Asset.objects.select_for_update().get(
                pk=allocation.asset_id
            )
            other_active_allocations = AssetAllocation.objects.filter(
                asset=asset,
                status=AssetAllocation.Status.ALLOCATED,
            ).exclude(pk=allocation.pk)
            if not other_active_allocations.exists():
                asset.status = Asset.Status.AVAILABLE
                asset.save(update_fields=['status'])
            AssetHistory.objects.create(
                asset=asset,
                employee=allocation.employee,
                event_type='Allocation Deleted - Returned',
                event_date=timezone.now(),
                remarks=f"Allocation deleted by {self.request.user}."
            )
        allocation.delete()


class AssetHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AssetHistorySerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'public_id'

    def get_queryset(self):
        user = self.request.user
        queryset = AssetHistory.objects.select_related(
            'asset',
            'employee',
        ).order_by('-event_date')
        role_name = getattr(getattr(user, 'role', None), 'role_name', None)

        if user.is_superuser or role_name in ASSET_MANAGER_ROLES:
            return queryset
        if role_name in [
            'Employee',
            'Department / Project Manager',
            'HR Manager',
        ]:
            return queryset.filter(employee__user=user)
        return queryset.none()