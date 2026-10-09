from rest_framework import serializers

from .models import Asset, AssetAllocation, AssetHistory
from apps.users.models import Employee


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = [
            'public_id',
            'asset_name',
            'category',
            'serial_number',
            'purchase_date',
            'status',
        ]
        read_only_fields = [
            'public_id',
            'status',  # Status can only be changed via allocation lifecycle
        ]


class AssetAllocationSerializer(serializers.ModelSerializer):
    asset = serializers.SlugRelatedField(
        queryset=Asset.objects.all(),
        slug_field='public_id'
    )

    employee = serializers.SlugRelatedField(
        queryset=Employee.objects.all(),
        slug_field='public_id'
    )

    class Meta:
        model = AssetAllocation
        fields = [
            'public_id',
            'asset',
            'employee',
            'allocation_date',
            'return_date',
            'status',
        ]
        read_only_fields = [
            'public_id',
        ]

    def validate(self, attrs):
        instance = self.instance
        allocation_date = attrs.get(
            'allocation_date',
            instance.allocation_date if instance else None,
        )
        return_date = attrs.get(
            'return_date',
            instance.return_date if instance else None,
        )

        if instance is None and (
            return_date is not None
            or attrs.get('status') == AssetAllocation.Status.RETURNED
        ):
            raise serializers.ValidationError(
                "New allocations must start in the allocated state."
            )

        if return_date and allocation_date and return_date < allocation_date:
            raise serializers.ValidationError(
                "Return date cannot be before allocation date."
            )

        if instance:
            if instance.status == AssetAllocation.Status.RETURNED:
                raise serializers.ValidationError(
                    "Returned allocations cannot be changed."
                )
            immutable_fields = {
                'asset': instance.asset,
                'employee': instance.employee,
                'allocation_date': instance.allocation_date,
            }
            for field, original_value in immutable_fields.items():
                if field in attrs and attrs[field] != original_value:
                    raise serializers.ValidationError({
                        field: "This field cannot be changed after allocation."
                    })
        return attrs


class AssetHistorySerializer(serializers.ModelSerializer):
    asset = serializers.SlugRelatedField(
        queryset=Asset.objects.all(),
        slug_field='public_id'
    )

    employee = serializers.SlugRelatedField(
        read_only=True,
        slug_field='public_id'
    )

    class Meta:
        model = AssetHistory
        fields = [
            'public_id',
            'asset',
            'employee',
            'event_type',
            'event_date',
            'remarks',
        ]
        read_only_fields = [
            'public_id',
        ]