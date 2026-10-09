from datetime import date

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.assets.models import Asset, AssetAllocation, AssetHistory
from apps.users.models import Employee, Role, User


class AssetApiTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.hr_role = Role.objects.create(role_name='HR Manager')
        self.it_role = Role.objects.create(role_name='IT')
        self.employee_role = Role.objects.create(role_name='Employee')

        self.admin = self.make_user('asset-admin', self.admin_role)
        self.hr_user = self.make_user('asset-hr', self.hr_role)
        self.it_user = self.make_user('asset-it', self.it_role)
        self.employee_user = self.make_user('asset-employee', self.employee_role)
        self.other_employee_user = self.make_user(
            'asset-other-employee',
            self.employee_role,
        )

        self.admin_employee = self.make_employee(
            self.admin,
            'Admin',
            'User',
            'asset-admin@example.com',
        )
        self.employee = self.make_employee(
            self.employee_user,
            'Jamie',
            'Employee',
            'jamie@example.com',
        )
        self.other_employee = self.make_employee(
            self.other_employee_user,
            'Taylor',
            'Employee',
            'taylor@example.com',
        )

        self.owned_asset = self.make_asset(
            'Assigned Laptop',
            'ASSET-OWNED',
            Asset.Status.ALLOCATED,
        )
        self.other_asset = self.make_asset(
            'Other Laptop',
            'ASSET-OTHER',
            Asset.Status.ALLOCATED,
        )
        self.available_asset = self.make_asset(
            'Available Monitor',
            'ASSET-AVAILABLE',
        )
        self.owned_allocation = self.make_allocation(
            self.owned_asset,
            self.employee,
        )
        self.other_allocation = self.make_allocation(
            self.other_asset,
            self.other_employee,
        )
        AssetHistory.objects.create(
            asset=self.owned_asset,
            employee=self.employee,
            event_type='Allocated',
            event_date=timezone.now(),
            remarks='Assigned to Jamie.',
        )
        AssetHistory.objects.create(
            asset=self.other_asset,
            employee=self.other_employee,
            event_type='Allocated',
            event_date=timezone.now(),
            remarks='Assigned to Taylor.',
        )

    def make_user(self, username, role):
        return User.objects.create_user(
            username=username,
            password='N3w!StrongPassword85',
            role=role,
        )

    def make_employee(self, user, first_name, last_name, email):
        return Employee.objects.create(
            user=user,
            first_name=first_name,
            last_name=last_name,
            email=email,
            hire_date=date(2024, 1, 15),
        )

    def make_asset(self, name, serial, asset_status=Asset.Status.AVAILABLE):
        return Asset.objects.create(
            asset_name=name,
            category='Computer equipment',
            serial_number=serial,
            status=asset_status,
        )

    def make_allocation(self, asset, employee):
        return AssetAllocation.objects.create(
            asset=asset,
            employee=employee,
            allocation_date=date(2026, 1, 10),
        )

    def asset_url(self, asset):
        return reverse(
            'asset-detail',
            kwargs={'public_id': str(asset.public_id)},
        )

    def allocation_url(self, allocation):
        return reverse(
            'asset-allocation-detail',
            kwargs={'public_id': str(allocation.public_id)},
        )

    def history_url(self, history):
        return reverse(
            'asset-history-detail',
            kwargs={'public_id': str(history.public_id)},
        )

    def test_employee_sees_only_assets_currently_allocated_to_them(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.get(reverse('asset-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item['public_id'] for item in response.data],
            [str(self.owned_asset.public_id)],
        )

    def test_system_admin_and_it_can_see_full_inventory(self):
        for user in [self.admin, self.it_user]:
            with self.subTest(username=user.username):
                self.client.force_authenticate(user)
                response = self.client.get(reverse('asset-list'))
                self.assertEqual(
                    response.status_code,
                    status.HTTP_200_OK,
                    response.data,
                )
                self.assertEqual(len(response.data), 3)

    def test_hr_does_not_get_full_asset_access(self):
        self.client.force_authenticate(self.hr_user)

        inventory_response = self.client.get(reverse('asset-list'))
        allocation_response = self.client.get(
            reverse('asset-allocation-list')
        )
        history_response = self.client.get(reverse('asset-history-list'))
        create_response = self.client.post(
            reverse('asset-list'),
            {
                'asset_name': 'HR-created asset',
                'category': 'Computer equipment',
            },
            format='json',
        )

        self.assertEqual(
            inventory_response.status_code,
            status.HTTP_200_OK,
            inventory_response.data,
        )
        self.assertEqual(inventory_response.data, [])
        self.assertEqual(allocation_response.data, [])
        self.assertEqual(history_response.data, [])
        self.assertEqual(
            create_response.status_code,
            status.HTTP_403_FORBIDDEN,
            create_response.data,
        )

    def test_employee_sees_only_their_allocation_and_history(self):
        self.client.force_authenticate(self.employee_user)

        allocation_response = self.client.get(
            reverse('asset-allocation-list')
        )
        history_response = self.client.get(reverse('asset-history-list'))

        self.assertEqual(
            allocation_response.status_code,
            status.HTTP_200_OK,
            allocation_response.data,
        )
        self.assertEqual(len(allocation_response.data), 1)
        self.assertEqual(
            str(allocation_response.data[0]['employee']),
            str(self.employee.public_id),
        )
        self.assertEqual(
            history_response.status_code,
            status.HTTP_200_OK,
            history_response.data,
        )
        self.assertEqual(len(history_response.data), 1)
        self.assertEqual(
            str(history_response.data[0]['employee']),
            str(self.employee.public_id),
        )

    def test_employee_cannot_retrieve_another_employees_asset_or_history(self):
        self.client.force_authenticate(self.employee_user)
        other_history = AssetHistory.objects.get(employee=self.other_employee)

        asset_response = self.client.get(self.asset_url(self.other_asset))
        history_response = self.client.get(self.history_url(other_history))

        self.assertEqual(
            asset_response.status_code,
            status.HTTP_404_NOT_FOUND,
            asset_response.data,
        )
        self.assertEqual(
            history_response.status_code,
            status.HTTP_404_NOT_FOUND,
            history_response.data,
        )

    def test_admin_can_create_allocation_and_asset_status_history(self):
        asset = self.available_asset
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('asset-allocation-list'),
            {
                'asset': str(asset.public_id),
                'employee': str(self.employee.public_id),
                'allocation_date': '2026-02-01',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        asset.refresh_from_db()
        self.assertEqual(asset.status, Asset.Status.ALLOCATED)
        allocation = AssetAllocation.objects.get(
            public_id=response.data['public_id']
        )
        history = AssetHistory.objects.get(
            asset=asset,
            event_type='Allocated',
        )
        self.assertEqual(allocation.status, AssetAllocation.Status.ALLOCATED)
        self.assertEqual(history.employee, self.employee)
        self.assertEqual(
            str(response.data['asset']),
            str(asset.public_id),
        )

    def test_allocation_rejects_unavailable_asset_and_invalid_return_date(self):
        self.client.force_authenticate(self.admin)

        unavailable_response = self.client.post(
            reverse('asset-allocation-list'),
            {
                'asset': str(self.owned_asset.public_id),
                'employee': str(self.employee.public_id),
                'allocation_date': '2026-02-01',
            },
            format='json',
        )
        self.assertEqual(
            unavailable_response.status_code,
            status.HTTP_400_BAD_REQUEST,
            unavailable_response.data,
        )

        invalid_return_date_response = self.client.patch(
            self.allocation_url(self.owned_allocation),
            {'return_date': '2026-01-09'},
            format='json',
        )
        self.assertEqual(
            invalid_return_date_response.status_code,
            status.HTTP_400_BAD_REQUEST,
            invalid_return_date_response.data,
        )

    def test_allocation_cannot_be_reassigned_after_creation(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.allocation_url(self.owned_allocation),
            {'asset': str(self.available_asset.public_id)},
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            response.data,
        )
        self.owned_allocation.refresh_from_db()
        self.assertEqual(self.owned_allocation.asset, self.owned_asset)

    def test_return_changes_asset_once_and_prevents_repeated_return_events(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.allocation_url(self.owned_allocation),
            {'status': AssetAllocation.Status.RETURNED},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.owned_asset.refresh_from_db()
        self.owned_allocation.refresh_from_db()
        self.assertEqual(self.owned_asset.status, Asset.Status.AVAILABLE)
        self.assertEqual(
            self.owned_allocation.status,
            AssetAllocation.Status.RETURNED,
        )
        self.assertIsNotNone(self.owned_allocation.return_date)
        self.assertEqual(
            AssetHistory.objects.filter(
                asset=self.owned_asset,
                event_type='Returned',
            ).count(),
            1,
        )

        repeated_response = self.client.patch(
            self.allocation_url(self.owned_allocation),
            {'status': AssetAllocation.Status.RETURNED},
            format='json',
        )
        self.assertEqual(
            repeated_response.status_code,
            status.HTTP_400_BAD_REQUEST,
            repeated_response.data,
        )
        self.assertEqual(
            AssetHistory.objects.filter(
                asset=self.owned_asset,
                event_type='Returned',
            ).count(),
            1,
        )

    def test_deleting_active_allocation_returns_asset_and_records_history(self):
        self.client.force_authenticate(self.admin)

        response = self.client.delete(
            self.allocation_url(self.owned_allocation)
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.owned_asset.refresh_from_db()
        self.assertEqual(self.owned_asset.status, Asset.Status.AVAILABLE)
        self.assertFalse(
            AssetAllocation.objects.filter(pk=self.owned_allocation.pk).exists()
        )
        self.assertTrue(
            AssetHistory.objects.filter(
                asset=self.owned_asset,
                employee=self.employee,
                event_type='Allocation Deleted - Returned',
            ).exists()
        )

    def test_status_endpoint_supports_maintenance_and_direct_status_is_rejected(self):
        self.client.force_authenticate(self.admin)
        status_url = reverse(
            'asset-change-status',
            kwargs={'public_id': str(self.available_asset.public_id)},
        )

        maintenance_response = self.client.patch(
            status_url,
            {'status': Asset.Status.MAINTENANCE},
            format='json',
        )
        self.assertEqual(
            maintenance_response.status_code,
            status.HTTP_200_OK,
            maintenance_response.data,
        )
        self.available_asset.refresh_from_db()
        self.assertEqual(
            self.available_asset.status,
            Asset.Status.MAINTENANCE,
        )

        direct_update_response = self.client.patch(
            self.asset_url(self.available_asset),
            {'status': Asset.Status.AVAILABLE},
            format='json',
        )
        self.assertEqual(
            direct_update_response.status_code,
            status.HTTP_400_BAD_REQUEST,
            direct_update_response.data,
        )

        available_response = self.client.patch(
            status_url,
            {'status': Asset.Status.AVAILABLE},
            format='json',
        )
        self.assertEqual(
            available_response.status_code,
            status.HTTP_200_OK,
            available_response.data,
        )
        self.assertEqual(
            AssetHistory.objects.filter(
                asset=self.available_asset,
                event_type='Status Changed',
            ).count(),
            2,
        )

    def test_status_endpoint_cannot_override_active_allocation(self):
        self.client.force_authenticate(self.admin)
        status_url = reverse(
            'asset-change-status',
            kwargs={'public_id': str(self.owned_asset.public_id)},
        )

        response = self.client.patch(
            status_url,
            {'status': Asset.Status.MAINTENANCE},
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            response.data,
        )
        self.owned_asset.refresh_from_db()
        self.assertEqual(self.owned_asset.status, Asset.Status.ALLOCATED)
