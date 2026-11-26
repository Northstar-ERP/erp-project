import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/auth';
import { client, unwrapList } from '../api/client';
import type { LeaveRequest, LeaveType } from '../api/types';
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
  TextareaField,
} from '../components/ui';

export default function LeavePage() {
  const { user, hasRole } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'request' | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{
    request: LeaveRequest;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const canReview = hasRole(['System Admin', 'HR Manager', 'Department / Project Manager']);

  const load = useCallback(async () => {
    try {
      const [requestResponse, typeResponse] = await Promise.all([
        client.leaveRequests(),
        client.leaveTypes(),
      ]);
      setRequests(unwrapList(requestResponse.data));
      setLeaveTypes(unwrapList(typeResponse.data).filter((type) => type.is_active));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createLeaveRequest({
        leave_type: String(form.get('leave_type')),
        start_date: String(form.get('start_date')),
        end_date: String(form.get('end_date')),
        reason: String(form.get('reason')),
      });
      setModal(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const reviewRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewDialog) return;
    setSaving(true);
    setFormError('');
    const comment = String(new FormData(event.currentTarget).get('comment') ?? '');
    try {
      if (reviewDialog.decision === 'approve') {
        await client.approveLeave(reviewDialog.request.public_id, comment);
      } else {
        await client.rejectLeave(reviewDialog.request.public_id, comment);
      }
      setReviewDialog(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const pending = requests.filter((request) => request.status.toLowerCase() === 'pending').length;

  return (
    <>
      <PageHeader eyebrow="Time away" title="Leave management" description="Request time off, follow its progress, and manage approvals." action={<Button onClick={() => { setFormError(''); setModal('request'); }}><Icon name="plus" size={16} /> Request leave</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[{ label: 'Requests shown', value: requests.length, icon: 'calendar' as const }, { label: 'Awaiting decision', value: pending, icon: 'clock' as const }, { label: 'Active leave types', value: leaveTypes.length, icon: 'check' as const }].map((metric) => <Card key={metric.label} className="flex items-center gap-4 p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name={metric.icon} size={18} /></span><div><p className="text-2xl font-bold text-slate-900">{metric.value}</p><p className="text-xs text-slate-500">{metric.label}</p></div></Card>)}
      </div>
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:px-6"><div><h2 className="text-sm font-bold text-slate-900">Leave requests</h2><p className="mt-1 text-xs text-slate-500">Showing records available to {user?.first_name || user?.username || 'your account'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{requests.length} records</span></div>
        {error && <div className="p-5 sm:px-6"><ErrorMessage>{error}</ErrorMessage></div>}
        {loading ? <LoadingState label="Loading leave requests" /> : requests.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-6 py-3.5">Employee</th><th className="px-5 py-3.5">Leave type</th><th className="px-5 py-3.5">Dates</th><th className="px-5 py-3.5">Days</th><th className="px-5 py-3.5">Status</th>{canReview && <th className="px-5 py-3.5">Review</th>}</tr></thead>
            <tbody className="divide-y divide-slate-100">{requests.map((request) => <tr key={request.public_id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><p className="text-sm font-semibold text-slate-800">{request.employee_name}</p><p className="mt-1 max-w-64 truncate text-xs text-slate-500">{request.reason}</p></td><td className="px-5 py-4 text-xs text-slate-600">{request.leave_type_name}</td><td className="px-5 py-4 text-xs text-slate-600">{formatDate(request.start_date)} <span className="text-slate-300">→</span> {formatDate(request.end_date)}</td><td className="px-5 py-4 text-xs font-semibold text-slate-700">{request.duration ?? '—'}</td><td className="px-5 py-4"><StatusBadge status={request.status} /></td>{canReview && <td className="px-5 py-4">{request.status.toLowerCase() === 'pending' && <div className="flex gap-2"><Button disabled={saving} onClick={() => { setFormError(''); setReviewDialog({ request, decision: 'approve' }); }} className="!min-h-8 !rounded-lg !px-3 !text-xs">Approve</Button><Button disabled={saving} variant="secondary" onClick={() => { setFormError(''); setReviewDialog({ request, decision: 'reject' }); }} className="!min-h-8 !rounded-lg !px-3 !text-xs">Reject</Button></div>}</td>}</tr>)}</tbody>
          </table>
        </div> : <EmptyState title="No leave requests yet" description="Your submitted leave applications will appear here with their latest status." action={<Button onClick={() => setModal('request')}><Icon name="plus" size={15} /> Submit a request</Button>} />}
      </Card>
      {modal === 'request' && <Modal title="Request time off" description="Send your dates and reason to the appropriate reviewer." onClose={() => setModal(null)}>
        <form onSubmit={submitRequest} className="space-y-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          <SelectField label="Leave type" name="leave_type" required defaultValue=""><option value="" disabled>Select leave type</option>{leaveTypes.map((type) => <option key={type.public_id} value={type.public_id}>{type.name}{type.is_paid ? ' · Paid' : ''}</option>)}</SelectField>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="First day" name="start_date" type="date" required /><Field label="Last day" name="end_date" type="date" required /></div>
          <TextareaField label="Reason" name="reason" required minLength={5} placeholder="Add a brief note for your reviewer…" />
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button disabled={saving || !leaveTypes.length}>{saving ? 'Submitting…' : 'Submit request'}</Button></div>
        </form>
      </Modal>}
      {reviewDialog && <Modal title={reviewDialog.decision === 'approve' ? 'Approve leave request' : 'Reject leave request'} description={`${reviewDialog.request.employee_name} · ${reviewDialog.request.leave_type_name}`} onClose={() => setReviewDialog(null)}>
        <form onSubmit={reviewRequest} className="space-y-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{reviewDialog.request.reason}</p>
          <TextareaField label="Reviewer comment (optional)" name="comment" placeholder="Add context for your decision…" />
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setReviewDialog(null)}>Cancel</Button><Button variant={reviewDialog.decision === 'approve' ? 'primary' : 'danger'} disabled={saving}>{saving ? 'Saving…' : reviewDialog.decision === 'approve' ? 'Approve request' : 'Reject request'}</Button></div>
        </form>
      </Modal>}
    </>
  );
}
