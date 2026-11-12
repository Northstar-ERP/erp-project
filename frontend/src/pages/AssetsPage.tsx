import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Asset, AssetAllocation, AssetHistory, Employee } from '../api/types';
import { displayError, formatDate } from '../components/format';
import { useAuth } from '../context/auth';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorMessage,
  Field,
  Icon,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  SelectField,
  StatusBadge,
  SuccessMessage,
} from '../components/ui';

type Tab = 'inventory' | 'allocations' | 'history';
const PAGE_SIZE = 8;

export default function AssetsPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = Boolean(
    user?.is_superuser || user?.role_name === 'System Admin' || hasRole(['System Admin']),
  );
  const canManageAssets = Boolean(
    isAdmin ||
      user?.role_name === 'IT' ||
      user?.role_name === 'HR Manager' ||
      hasRole(['System Admin', 'IT', 'HR Manager']),
  );

  const [tab, setTab] = useState<Tab>('inventory');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [allocations, setAllocations] = useState<AssetAllocation[]>([]);
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals & Forms
  const [modal, setModal] = useState<'asset' | 'allocation' | null>(null);
  const [preselectedAllocAsset, setPreselectedAllocAsset] = useState('');
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [statusChangeAsset, setStatusChangeAsset] = useState<Asset | null>(null);
  const [retiringAsset, setRetiringAsset] = useState<Asset | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [returningAllocation, setReturningAllocation] = useState<AssetAllocation | null>(null);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      const [assetRes, allocRes, historyRes, empRes] = await Promise.all([
        client.assets(),
        client.allocations(),
        client.assetHistory(),
        client.employees(),
      ]);
      setAssets(unwrapList(assetRes.data));
      setAllocations(unwrapList(allocRes.data));
      setHistory(unwrapList(historyRes.data));
      setEmployees(unwrapList(empRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Asset map by public_id
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of assets) {
      map.set(a.public_id, a);
    }
    return map;
  }, [assets]);

  // Employee map by public_id
  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.public_id, emp);
    }
    return map;
  }, [employees]);

  // Categories list from existing assets
  const availableCategories = useMemo(() => {
    return Array.from(new Set(assets.map((a) => a.category).filter(Boolean)));
  }, [assets]);

  // Filtered Inventory
  const filteredAssets = useMemo(() => {
    return assets.filter((item) => {
      const matchesSearch =
        !search ||
        item.asset_name.toLowerCase().includes(search.toLowerCase()) ||
        (item.serial_number || '').toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      const matchesStatus = !statusFilter || (item.status || '').toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [assets, search, categoryFilter, statusFilter]);

  // Filtered Allocations
  const filteredAllocations = useMemo(() => {
    return allocations.filter((item) => {
      const a = assetMap.get(item.asset);
      const emp = employeeMap.get(item.employee);
      const assetLabel = a ? `${a.asset_name} ${a.serial_number || ''}` : item.asset;
      const empLabel = emp ? `${emp.first_name} ${emp.last_name} ${emp.department_name || ''}` : item.employee;

      return (
        !search ||
        assetLabel.toLowerCase().includes(search.toLowerCase()) ||
        empLabel.toLowerCase().includes(search.toLowerCase()) ||
        item.status.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [allocations, assetMap, employeeMap, search]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const a = assetMap.get(item.asset);
      const emp = item.employee ? employeeMap.get(item.employee) : undefined;
      const assetLabel = a ? a.asset_name : item.asset;
      const empLabel = emp ? `${emp.first_name} ${emp.last_name}` : '';

      return (
        !search ||
        item.event_type.toLowerCase().includes(search.toLowerCase()) ||
        assetLabel.toLowerCase().includes(search.toLowerCase()) ||
        empLabel.toLowerCase().includes(search.toLowerCase()) ||
        (item.remarks || '').toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [history, assetMap, employeeMap, search]);

  const activeRows =
    tab === 'inventory'
      ? filteredAssets
      : tab === 'allocations'
      ? filteredAllocations
      : filteredHistory;

  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return activeRows.slice(start, start + PAGE_SIZE);
  }, [activeRows, page]);

  // Return allocated asset
  const handleReturnAsset = async (allocation: AssetAllocation) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await client.updateAllocation(allocation.public_id, {
        status: 'Returned',
        return_date: today,
      });
      setSuccess('Asset marked as returned and restored to inventory.');
      setReturningAllocation(null);
      await load();
    } catch (cause) {
      setError(displayError(cause));
      setReturningAllocation(null);
    } finally {
      setSaving(false);
    }
  };

  // Create new asset
  const createAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createAsset({
        asset_name: String(form.get('asset_name')).trim(),
        category: String(form.get('category')).trim(),
        serial_number: String(form.get('serial_number') || '').trim() || null,
        purchase_date: String(form.get('purchase_date') || '') || null,
      });
      setModal(null);
      setSuccess('Asset registered to company inventory successfully.');
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Edit existing asset
  const handleUpdateAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAsset) return;
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.updateAsset(editingAsset.public_id, {
        asset_name: String(form.get('asset_name')).trim(),
        category: String(form.get('category')).trim(),
        serial_number: String(form.get('serial_number') || '').trim() || null,
        purchase_date: String(form.get('purchase_date') || '') || null,
      });
      setEditingAsset(null);
      setSuccess(`Asset "${editingAsset.asset_name}" updated successfully.`);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Change asset status (e.g. Maintenance, Available, Retired)
  const handleChangeStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!statusChangeAsset) return;
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    const newStatus = String(form.get('status'));
    try {
      await client.changeAssetStatus(statusChangeAsset.public_id, newStatus);
      setStatusChangeAsset(null);
      setSuccess(`Asset status updated to "${newStatus}".`);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Quick retire asset
  const handleRetireAsset = async (asset: Asset) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await client.changeAssetStatus(asset.public_id, 'Retired');
      setRetiringAsset(null);
      setSuccess(`Asset "${asset.asset_name}" has been retired.`);
      await load();
    } catch (cause) {
      setError(displayError(cause));
      setRetiringAsset(null);
    } finally {
      setSaving(false);
    }
  };

  // Delete asset
  const handleDeleteAsset = async (asset: Asset) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await client.deleteAsset(asset.public_id);
      setAssetToDelete(null);
      setSuccess(`Asset "${asset.asset_name}" deleted from inventory.`);
      await load();
    } catch (cause) {
      setError(displayError(cause));
      setAssetToDelete(null);
    } finally {
      setSaving(false);
    }
  };

  // Allocate asset
  const createAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createAllocation({
        asset: String(form.get('asset')),
        employee: String(form.get('employee')),
        allocation_date: String(form.get('allocation_date')),
      });
      setModal(null);
      setSuccess('Equipment allocated to employee successfully.');
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Counts
  const activeAllocationsCount = useMemo(
    () => allocations.filter((a) => (a.status || '').toLowerCase() === 'allocated').length,
    [allocations],
  );
  const availableAssetsCount = useMemo(
    () => assets.filter((a) => (a.status || '').toLowerCase() === 'available').length,
    [assets],
  );
  const maintenanceCount = useMemo(
    () => assets.filter((a) => (a.status || '').toLowerCase() === 'maintenance').length,
    [assets],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? 'Organization Monitoring' : 'Hardware & Asset Operations'}
        title="Asset Management & Allocations"
        description={
          isAdmin
            ? 'Monitor hardware inventory, track employee device custody, and review audit history across the company.'
            : 'Manage company assets, register hardware, allocate devices to personnel, and track returns and maintenance.'
        }
        action={
          canManageAssets ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFormError('');
                  setPreselectedAllocAsset('');
                  setModal('allocation');
                }}
              >
                <Icon name="users" size={14} /> Allocate Equipment
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormError('');
                  setModal('asset');
                }}
              >
                <Icon name="plus" size={14} /> Add Asset
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* KPI Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="cube" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{assets.length}</p>
              <p className="text-xs text-slate-500 font-medium">Inventory Units</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon name="check-circle" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{availableAssetsCount}</p>
              <p className="text-xs text-slate-500 font-medium">Available for Allocation</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Icon name="users" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeAllocationsCount}</p>
              <p className="text-xs text-slate-500 font-medium">Assigned to Employees</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Icon name="clock" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{maintenanceCount}</p>
              <p className="text-xs text-slate-500 font-medium">In Maintenance / Service</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card with Tabs */}
      <Card className="overflow-hidden">
        {/* Navigation Tabs and Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('inventory');
                setPage(1);
                setCategoryFilter('');
                setStatusFilter('');
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'inventory'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name="cube" size={14} />
              <span>Asset Inventory ({assets.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab('allocations');
                setPage(1);
                setCategoryFilter('');
                setStatusFilter('');
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'allocations'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name="users" size={14} />
              <span>Employee Allocations ({allocations.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab('history');
                setPage(1);
                setCategoryFilter('');
                setStatusFilter('');
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name="clock" size={14} />
              <span>Allocation History ({history.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'inventory' && (
              <>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none"
                >
                  <option value="">All Categories</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Available">Available</option>
                  <option value="Allocated">Allocated</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Retired">Retired</option>
                  <option value="Lost">Lost</option>
                </select>
              </>
            )}

            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                placeholder={
                  tab === 'inventory'
                    ? 'Search equipment, model, serial...'
                    : tab === 'allocations'
                    ? 'Search employee or assigned device...'
                    : 'Search events, equipment, or remarks...'
                }
              />
            </div>
          </div>
        </div>

        {/* Content Table */}
        {loading ? (
          <div className="p-12">
            <LoadingState label="Loading equipment telemetry and allocation history..." />
          </div>
        ) : activeRows.length === 0 ? (
          <EmptyState
            icon="cube"
            title="No matching asset records"
            description="Adjust your search criteria or register equipment into inventory."
            action={
              canManageAssets ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setFormError('');
                    setModal(tab === 'allocations' ? 'allocation' : 'asset');
                  }}
                >
                  <Icon name="plus" size={14} />{' '}
                  {tab === 'allocations' ? 'Allocate Equipment' : 'Register Asset'}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-slate-100 font-semibold uppercase tracking-wider text-[10px] text-slate-500">
                  {tab === 'inventory' ? (
                    <tr>
                      <th className="px-5 py-3">Asset Name / Model</th>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3">Serial / Asset Tag</th>
                      <th className="px-5 py-3">Purchase Date</th>
                      <th className="px-5 py-3">Availability</th>
                      {canManageAssets && <th className="px-5 py-3 text-right">Actions</th>}
                    </tr>
                  ) : tab === 'allocations' ? (
                    <tr>
                      <th className="px-5 py-3">Equipment Details</th>
                      <th className="px-5 py-3">Assigned Employee</th>
                      <th className="px-5 py-3">Allocation Date</th>
                      <th className="px-5 py-3">Return Date</th>
                      <th className="px-5 py-3">Status</th>
                      {canManageAssets && <th className="px-5 py-3 text-right">Actions</th>}
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-5 py-3">Event Date</th>
                      <th className="px-5 py-3">Equipment</th>
                      <th className="px-5 py-3">Associated Employee</th>
                      <th className="px-5 py-3">Event Type</th>
                      <th className="px-5 py-3">Audit Remarks</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {tab === 'inventory' &&
                    (pageRows as Asset[]).map((asset) => (
                      <tr key={asset.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5 font-semibold text-slate-900">
                          {asset.asset_name}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                            {asset.category}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                          {asset.serial_number || '—'}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                          {formatDate(asset.purchase_date)}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={asset.status} />
                        </td>
                        {canManageAssets && (
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {asset.status === 'Available' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="px-2 py-1 text-[11px]"
                                  onClick={() => {
                                    setFormError('');
                                    setPreselectedAllocAsset(asset.public_id);
                                    setModal('allocation');
                                  }}
                                >
                                  Allocate
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                className="px-2 py-1 text-[11px]"
                                onClick={() => {
                                  setFormError('');
                                  setEditingAsset(asset);
                                }}
                              >
                                Edit
                              </Button>
                              {asset.status !== 'Allocated' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="px-2 py-1 text-[11px]"
                                  onClick={() => {
                                    setFormError('');
                                    setStatusChangeAsset(asset);
                                  }}
                                >
                                  Status
                                </Button>
                              )}
                              {asset.status !== 'Allocated' && asset.status !== 'Retired' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="px-2 py-1 text-[11px]"
                                  onClick={() => setRetiringAsset(asset)}
                                >
                                  Retire
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="px-2 py-1 text-[11px]"
                                onClick={() => {
                                  setTab('history');
                                  setSearch(asset.asset_name);
                                  setPage(1);
                                }}
                              >
                                History
                              </Button>
                              {asset.status !== 'Allocated' && (
                                <button
                                  type="button"
                                  onClick={() => setAssetToDelete(asset)}
                                  className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                  title="Delete Asset"
                                  aria-label={`Delete ${asset.asset_name}`}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}

                  {tab === 'allocations' &&
                    (pageRows as AssetAllocation[]).map((allocation) => {
                      const a = assetMap.get(allocation.asset);
                      const emp = employeeMap.get(allocation.employee);
                      const isAllocated = allocation.status.toLowerCase() === 'allocated';

                      return (
                        <tr key={allocation.public_id} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-900">
                              {a ? a.asset_name : allocation.asset}
                            </p>
                            {a?.serial_number && (
                              <p className="text-[11px] font-mono text-slate-500">
                                SN: {a.serial_number} • {a.category}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800">
                              {emp ? `${emp.first_name} ${emp.last_name}` : allocation.employee}
                            </p>
                            {emp?.department_name && (
                              <p className="text-[11px] text-slate-500">
                                {emp.department_name} • {emp.job_title || 'Staff'}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                            {formatDate(allocation.allocation_date)}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                            {formatDate(allocation.return_date)}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={allocation.status} />
                          </td>
                          {canManageAssets && (
                            <td className="px-5 py-3.5 text-right">
                              {isAllocated ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="px-2 py-1 text-[11px]"
                                  onClick={() => setReturningAllocation(allocation)}
                                >
                                  Return Asset
                                </Button>
                              ) : (
                                <span className="text-[11px] text-slate-400">Restored</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}

                  {tab === 'history' &&
                    (pageRows as AssetHistory[]).map((entry) => {
                      const a = assetMap.get(entry.asset);
                      const emp = entry.employee ? employeeMap.get(entry.employee) : undefined;

                      return (
                        <tr key={entry.public_id} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                            {formatDate(entry.event_date)}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {a ? a.asset_name : entry.asset}
                          </td>
                          <td className="px-5 py-3.5 text-slate-800 font-medium">
                            {emp ? `${emp.first_name} ${emp.last_name}` : entry.employee || '—'}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                              <Icon name="cube" size={11} /> {entry.event_type}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 max-w-sm">
                            {entry.remarks || '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={activeRows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Register Asset */}
      {modal === 'asset' && canManageAssets && (
        <Modal
          title="Register Asset to Inventory"
          description="Enter hardware specifications, category classification, and serial records."
          onClose={() => setModal(null)}
        >
          <form className="space-y-4" onSubmit={createAsset}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Asset Description / Model"
              name="asset_name"
              required
              placeholder="e.g. Dell XPS 15 9530"
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Category"
                name="category"
                required
                placeholder="Laptop, Workstation, Monitor..."
              />
              <Field
                label="Serial Number (Optional)"
                name="serial_number"
                placeholder="e.g. 8VJ3KD2"
              />
            </div>

            <Field label="Procurement / Purchase Date" name="purchase_date" type="date" />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? 'Registering...' : 'Save Asset'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Asset Details */}
      {editingAsset && (
        <Modal
          title="Edit Asset Details"
          description={`Update details for ${editingAsset.asset_name}`}
          onClose={() => setEditingAsset(null)}
        >
          <form className="space-y-4" onSubmit={handleUpdateAsset}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Asset Description / Model"
              name="asset_name"
              required
              defaultValue={editingAsset.asset_name}
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Category"
                name="category"
                required
                defaultValue={editingAsset.category}
              />
              <Field
                label="Serial Number"
                name="serial_number"
                defaultValue={editingAsset.serial_number || ''}
              />
            </div>

            <Field
              label="Purchase Date"
              name="purchase_date"
              type="date"
              defaultValue={editingAsset.purchase_date || ''}
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setEditingAsset(null)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? 'Saving...' : 'Update Asset'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Change Asset Status */}
      {statusChangeAsset && (
        <Modal
          title="Change Asset Status"
          description={`Update lifecycle status for ${statusChangeAsset.asset_name}`}
          onClose={() => setStatusChangeAsset(null)}
        >
          <form className="space-y-4" onSubmit={handleChangeStatus}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <div className="text-xs text-slate-600 mb-2">
              Current Status: <strong>{statusChangeAsset.status}</strong>
            </div>

            <SelectField
              label="New Status"
              name="status"
              required
              defaultValue={statusChangeAsset.status}
            >
              <option value="Available">Available</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Retired">Retired</option>
              <option value="Lost">Lost</option>
            </SelectField>

            <p className="text-[11px] text-slate-500">
              Note: To set status to "Allocated", assign the asset to an employee using the Equipment Allocation workflow.
            </p>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setStatusChangeAsset(null)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? 'Updating...' : 'Confirm Status Change'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: New Allocation */}
      {modal === 'allocation' && canManageAssets && (
        <Modal
          title="Allocate Equipment to Employee"
          description="Assign available inventory equipment to an authorized team member."
          onClose={() => setModal(null)}
        >
          <form className="space-y-4" onSubmit={createAllocation}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Available Inventory Device"
              name="asset"
              required
              defaultValue={preselectedAllocAsset}
            >
              <option value="" disabled>
                Select equipment...
              </option>
              {assets
                .filter((a) => (a.status || '').toLowerCase() === 'available')
                .map((a) => (
                  <option key={a.public_id} value={a.public_id}>
                    {a.asset_name} ({a.category} • {a.serial_number || 'No Serial'})
                  </option>
                ))}
            </SelectField>

            <SelectField label="Recipient Employee" name="employee" required defaultValue="">
              <option value="" disabled>
                Select recipient...
              </option>
              {employees.map((emp) => (
                <option key={emp.public_id} value={emp.public_id}>
                  {emp.first_name} {emp.last_name} ({emp.department_name || emp.job_title || 'Staff'})
                </option>
              ))}
            </SelectField>

            <Field
              label="Effective Allocation Date"
              name="allocation_date"
              type="date"
              required
              defaultValue={today}
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                disabled={
                  saving ||
                  !assets.some((a) => (a.status || '').toLowerCase() === 'available') ||
                  employees.length === 0
                }
              >
                {saving ? 'Allocating...' : 'Confirm Allocation'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Return Confirmation Dialog */}
      {returningAllocation && (
        <ConfirmDialog
          isOpen={true}
          title="Return Equipment to Stock"
          description={`Are you sure you want to mark equipment allocation "${
            assetMap.get(returningAllocation.asset)?.asset_name || returningAllocation.asset
          }" as returned? The hardware will be restored to Available status in inventory and logged in history.`}
          confirmLabel="Mark Returned"
          isLoading={saving}
          onConfirm={() => void handleReturnAsset(returningAllocation)}
          onCancel={() => setReturningAllocation(null)}
        />
      )}

      {/* Retire Confirmation Dialog */}
      {retiringAsset && (
        <ConfirmDialog
          isOpen={true}
          title="Retire Asset"
          description={`Are you sure you want to retire "${retiringAsset.asset_name}"? Retired assets cannot be allocated to employees.`}
          confirmLabel="Retire Asset"
          isDestructive={true}
          isLoading={saving}
          onConfirm={() => void handleRetireAsset(retiringAsset)}
          onCancel={() => setRetiringAsset(null)}
        />
      )}

      {/* Delete Asset Confirmation Dialog */}
      {assetToDelete && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Asset"
          description={`Are you sure you want to delete "${assetToDelete.asset_name}" from active inventory?`}
          confirmLabel="Delete Asset"
          isDestructive={true}
          isLoading={saving}
          onConfirm={() => void handleDeleteAsset(assetToDelete)}
          onCancel={() => setAssetToDelete(null)}
        />
      )}
    </div>
  );
}
