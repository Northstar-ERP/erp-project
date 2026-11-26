from django.db import transaction
from rest_framework import viewsets

class AuditModelViewSet(viewsets.ModelViewSet):
    lookup_field = "public_id"

    def get_queryset(self):
        queryset = super().get_queryset()
        if hasattr(queryset.model, "is_deleted"):
            return queryset.filter(is_deleted=False)
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        if hasattr(serializer.Meta.model, "created_by"):
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()  # Calls soft delete on AuditBaseModel

# Aliases so both existing and new modules can import without errors
BaseAuditViewSet = AuditModelViewSet
AuditViewSet = AuditModelViewSet