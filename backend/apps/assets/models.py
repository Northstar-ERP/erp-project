import uuid
from django.db import models


class Asset(models.Model):

    class Status(models.TextChoices):
        AVAILABLE = 'Available', 'Available'
        ALLOCATED = 'Allocated', 'Allocated'
        MAINTENANCE = 'Maintenance', 'Maintenance'
        RETIRED = 'Retired', 'Retired'
        LOST = 'Lost', 'Lost'

    public_id = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True
    )

    asset_name = models.CharField(
        max_length=200
    )

    category = models.CharField(
        max_length=100
    )

    serial_number = models.CharField(
        max_length=200,
        unique=True,
        blank=True,
        null=True
    )

    purchase_date = models.DateField(
        blank=True,
        null=True
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AVAILABLE
    )

    def __str__(self):
        return f"{self.asset_name} - {self.serial_number}"


class AssetAllocation(models.Model):

    class Status(models.TextChoices):
        ALLOCATED = 'Allocated', 'Allocated'
        RETURNED = 'Returned', 'Returned'

    public_id = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True
    )

    asset = models.ForeignKey(
        Asset,
        on_delete=models.PROTECT,
        related_name='allocations'
    )

    employee = models.ForeignKey(
        'users.Employee',
        on_delete=models.PROTECT,
        related_name='asset_allocations'
    )

    allocation_date = models.DateField()

    return_date = models.DateField(
        blank=True,
        null=True
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ALLOCATED
    )

    def __str__(self):
        return f"{self.asset.asset_name} → {self.employee}"


class AssetHistory(models.Model):

    public_id = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True
    )

    asset = models.ForeignKey(
        Asset,
        on_delete=models.PROTECT,
        related_name='history'
    )

    employee = models.ForeignKey(
        'users.Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_history'
    )

    event_type = models.CharField(
        max_length=100
    )

    event_date = models.DateTimeField()

    remarks = models.TextField(
        blank=True,
        null=True
    )

    def __str__(self):
        return f"{self.asset.asset_name} - {self.event_type}"