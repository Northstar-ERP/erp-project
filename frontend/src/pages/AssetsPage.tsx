import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Asset, AssetAllocation, AssetHistory, Employee } from '../api/types';
import { displayError, formatDate } from '../components/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Icon,
  LoadingState,
  Modal,
  PageHeader,
  SelectField,
  StatusBadge,
} from '../components/ui';

type Tab = 'inventory' | 'allocations' | 'history';

export default function AssetsPage() {
  const [tab, setTab] = useState<Tab>('inventory');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [allocations, setAllocations] = useState<AssetAllocation[]>([]);
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Tab | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      const [assetResponse, allocationResponse, historyResponse, employeeResponse] = await Promise.all([
        client.assets(),
        client.allocations(),
        client.assetHistory(),
        client.employees(),
      ]);
      setAssets(unwrapList(assetResponse.data));
      setAllocations(unwrapList(allocationResponse.data));
      setHistory(unwrapList(historyResponse.data));
      setEmployees(unwrapList(employeeResponse.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const activeAllocations = useMemo(() => allocations.filter((item) => item.status.toLowerCase() === 'allocated'), [allocations]);

  const createAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createAsset({
        asset_name: String(form.get('asset_name')),
        category: String(form.get('category')),
        serial_number: String(form.get('serial_number') ?? ''),
        purchase_date: String(form.get('purchase_date') ?? '') || null,
      });
      setModal(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const createAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createAllocation({
        asset: String(form.get('asset')),
        employee: String(form.get('employee')),
        allocation_date: String(form.get('allocation_date')),
      });
      setModal(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const returnAsset = async (allocation: AssetAllocation) => {
    try {
      await client.updateAllocation(allocation.public_id, {
        status: 'Returned',
        return_date: today,
      });
      await load();
    } catch (cause) {
      setError(displayError(cause));
    }
  };

  const modalTitle = modal === 'inventory' ? 'Register an asset' : 'Allocate an asset';

  return (
    <>
      <PageHeader eyebrow="Workplace resources" title="Asset management" description="Keep an accurate inventory and see what’s assigned across your team." action={<Button onClick={() => { setFormError(''); setModal(tab === 'inventory' ? 'inventory' : 'allocations'); }}><Icon name="plus" size={16} /> {tab === 'inventory' ? 'Add asset' : 'New allocation'}</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[{ label: 'Inventory', value: assets.length }, { label: 'Available', value: assets.filter((asset) => asset.status.toLowerCase() === 'available').length }, { label: 'Currently allocated', value: activeAllocations.length }].map((item) => <Card key={item.label} className="flex items-center justify-between p-5"><div><p className="text-xs font-medium text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p></div><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name="cube" /></span></Card>)}
      </div>
      <Card>
        <div className="flex flex-wrap gap-1 border-b border-slate-100 p-4 sm:px-6">
          {([{ key: 'inventory', label: 'Inventory', count: assets.length }, { key: 'allocations', label: 'Allocations', count: allocations.length }, { key: 'history', label: 'History', count: history.length }] as const).map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition ${tab === item.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>{item.label}<span className="ml-2 text-[10px] opacity-60">{item.count}</span></button>)}
        </div>
        {error && <div className="p-5 sm:px-6"><ErrorMessage>{error}</ErrorMessage></div>}
        {loading ? <LoadingState label="Loading asset records" /> : tab === 'inventory' ? assets.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-6 py-3.5">Asset</th><th className="px-5 py-3.5">Category</th><th className="px-5 py-3.5">Serial number</th><th className="px-5 py-3.5">Purchase date</th><th className="px-5 py-3.5">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{assets.map((asset) => <tr key={asset.public_id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><p className="text-sm font-semibold text-slate-800">{asset.asset_name}</p><p className="mt-1 max-w-48 truncate font-mono text-[10px] text-slate-400">{asset.public_id}</p></td><td className="px-5 py-4 text-xs text-slate-600">{asset.category}</td><td className="px-5 py-4 text-xs text-slate-600">{asset.serial_number || '—'}</td><td className="px-5 py-4 text-xs text-slate-600">{formatDate(asset.purchase_date)}</td><td className="px-5 py-4"><StatusBadge status={asset.status} /></td></tr>)}</tbody>
          </table>
        </div> : <EmptyState title="No assets in inventory" description="Register your first asset to start tracking availability and allocations." action={<Button onClick={() => setModal('inventory')}><Icon name="plus" size={15} /> Register asset</Button>} /> : tab === 'allocations' ? allocations.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-6 py-3.5">Asset reference</th><th className="px-5 py-3.5">Employee reference</th><th className="px-5 py-3.5">Allocated</th><th className="px-5 py-3.5">Returned</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{allocations.map((allocation) => <tr key={allocation.public_id} className="hover:bg-slate-50/70"><td className="max-w-48 truncate px-6 py-4 font-mono text-[10px] text-slate-600" title={allocation.asset}>{allocation.asset}</td><td className="max-w-48 truncate px-5 py-4 font-mono text-[10px] text-slate-600" title={allocation.employee}>{allocation.employee}</td><td className="px-5 py-4 text-xs text-slate-600">{formatDate(allocation.allocation_date)}</td><td className="px-5 py-4 text-xs text-slate-600">{formatDate(allocation.return_date)}</td><td className="px-5 py-4"><StatusBadge status={allocation.status} /></td><td className="px-5 py-4">{allocation.status.toLowerCase() === 'allocated' && <Button variant="secondary" onClick={() => void returnAsset(allocation)} className="!min-h-8 !rounded-lg !px-3 !text-xs">Mark returned</Button>}</td></tr>)}</tbody>
          </table>
        </div> : <EmptyState title="No allocations yet" description="Assign available equipment to a team member to start tracking it." action={<Button onClick={() => setModal('allocations')}><Icon name="plus" size={15} /> Create allocation</Button>} /> : history.length ? <div className="divide-y divide-slate-100">{history.map((entry) => <div key={entry.public_id} className="flex items-start gap-4 px-5 py-4 sm:px-6"><span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name="clock" size={17} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-800">{entry.event_type}</p><span className="text-[11px] text-slate-400">{new Date(entry.event_date).toLocaleString()}</span></div><p className="mt-1 truncate font-mono text-[10px] text-slate-500">Asset {entry.asset}{entry.employee ? ` · Employee ${entry.employee}` : ''}</p>{entry.remarks && <p className="mt-1 text-xs text-slate-500">{entry.remarks}</p>}</div></div>)}</div> : <EmptyState title="No history yet" description="Asset allocation and status events will appear here." />}
      </Card>
      {modal === 'inventory' && <Modal title={modalTitle} description="Add a new item to the company inventory." onClose={() => setModal(null)}>
        <form onSubmit={createAsset} className="space-y-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          <Field label="Asset name" name="asset_name" required placeholder="e.g. MacBook Pro 14”" />
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Category" name="category" required placeholder="Laptop, monitor, phone…" /><Field label="Serial number" name="serial_number" placeholder="Optional" /></div>
          <Field label="Purchase date" name="purchase_date" type="date" />
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Register asset'}</Button></div>
        </form>
      </Modal>}
      {modal === 'allocations' && <Modal title={modalTitle} description="Choose an available asset and its new owner." onClose={() => setModal(null)}>
        <form onSubmit={createAllocation} className="space-y-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          <SelectField label="Available asset" name="asset" required defaultValue=""><option value="" disabled>Select an asset</option>{assets.filter((asset) => asset.status.toLowerCase() === 'available').map((asset) => <option key={asset.public_id} value={asset.public_id}>{asset.asset_name} · {asset.serial_number || asset.category}</option>)}</SelectField>
          <SelectField label="Employee" name="employee" required defaultValue=""><option value="" disabled>Select an employee</option>{employees.map((employee) => <option key={employee.public_id} value={employee.public_id}>{employee.first_name} {employee.last_name}</option>)}</SelectField>
          <Field label="Allocation date" name="allocation_date" type="date" required defaultValue={today} />
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button disabled={saving || !assets.some((asset) => asset.status.toLowerCase() === 'available') || !employees.length}>{saving ? 'Allocating…' : 'Allocate asset'}</Button></div>
        </form>
      </Modal>}
    </>
  );
}
