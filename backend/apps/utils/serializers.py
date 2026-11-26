from rest_framework import serializers

class BaseAuditSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source="created_by.username")

    class Meta:
        abstract = True
        read_only_fields = (
            "id",
            "public_id",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "is_deleted",
        )

# Alias for compatibility across modules
AuditModelSerializer = BaseAuditSerializer