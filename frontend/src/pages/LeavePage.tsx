import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Department, Employee, LeaveRequest, LeaveType } from '../api/types';
import { displayError, formatDate } from '../components/format';
import { useAuth } from '../context/auth';
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
  Pagination,
  SearchInput,
  SelectField,
  StatusBadge,
  SuccessMessage,
  TextareaField,
} from '../components/ui';

type TabView = 'all' | 'pending' | 'approved' | 'rejected' | 'history';
const PAGE_SIZE = 8;

export default function LeavePage() {
  const { user, hasRole } = useAuth();
  const isAdmin = Boolean(
    user?.is_superuser || user?.role_name === 'System Admin' || hasRole(['System Admin']),
  );
  const isHR = user?.role_name === 'HR Manager' || hasRole(['HR Manager']);
  const isPM =
    user?.role_name === 'Department / Project Manager' ||
    hasRole(['Department / Project Manager']);
  // HR Managers, System Admins, and direct Project Managers can approve/reject pending leave.
  const canApproveOrReject = isHR || isAdmin || isPM;
  // Admin must not need to submit a leave request for themselves.
  const canSubmitLeave = !isAdmin && Boolean(user?.employee_public_id || !isHR);

  const [tab, setTab] = useState<TabView>('all');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals & Forms
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{
    request: LeaveRequest;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [page, setPage] = useState(1);

  // Map employee public_id to department info
  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.public_id, emp);
      map.set(`${emp.first_name} ${emp.last_name}`.toLowerCase(), emp);
    }
    return map;
  }, [employees]);

  const load = useCallback(async () => {
    try {
      const [reqRes, typeRes, empRes, deptRes] = await Promise.allSettled([
        client.leaveRequests(),
        client.leaveTypes(),
        client.employees(),
        client.departments(),
      ]);

      if (reqRes.status === 'fulfilled') {
        setRequests(unwrapList(reqRes.value.data));
      } else {
        setError(displayError(reqRes.reason));
      }
      if (typeRes.status === 'fulfilled') {
        setLeaveTypes(unwrapList(typeRes.value.data).filter((t) => t.is_active));
      }
      if (empRes.status === 'fulfilled') {
        setEmployees(unwrapList(empRes.value.data));
      }
      if (deptRes.status === 'fulfilled') {
        setDepartments(unwrapList(deptRes.value.data));
      }
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Tab filtering
  const tabFilteredRequests = useMemo(() => {
    return requests.filter((item) => {
      const st = (item.status || '').toLowerCase();
      if (tab === 'pending') return st === 'pending';
      if (tab === 'approved') return st === 'approved';
      if (tab === 'rejected') return st === 'rejected';
      if (tab === 'history') return st === 'approved' || st === 'rejected';
      return true;
    });
  }, [requests, tab]);

  // Multi-field filtering
  const filteredRequests = useMemo(() => {
    return tabFilteredRequests.filter((item) => {
      // Find employee info
      const emp =
        (item.employee ? employeeMap.get(String(item.employee)) : undefined) ||
        employeeMap.get((item.employee_name || '').toLowerCase());

      const deptName = emp?.department_name || '';

      const matchesSearch =
        !search ||
        (item.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.leave_type_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.reason || '').toLowerCase().includes(search.toLowerCase()) ||
        deptName.toLowerCase().includes(search.toLowerCase());

      const matchesEmployee =
        !employeeFilter ||
        String(item.employee) === employeeFilter ||
        (item.employee_name || '').toLowerCase().includes(employeeFilter.toLowerCase());

      const matchesDepartment =
        !departmentFilter ||
        emp?.department === departmentFilter ||
        deptName.toLowerCase() === departmentFilter.toLowerCase();

      const matchesType = !typeFilter || item.leave_type === typeFilter;
      const matchesStatus =
        !statusFilter || item.status.toLowerCase() === statusFilter.toLowerCase();

      const matchesStartDate = !startDateFilter || item.start_date >= startDateFilter;
      const matchesEndDate = !endDateFilter || item.end_date <= endDateFilter;

      return (
        matchesSearch &&
        matchesEmployee &&
        matchesDepartment &&
        matchesType &&
        matchesStatus &&
        matchesStartDate &&
        matchesEndDate
      );
    });
  }, [
    tabFilteredRequests,
    employeeMap,
    search,
    employeeFilter,
    departmentFilter,
    typeFilter,
    statusFilter,
    startDateFilter,
    endDateFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRequests.slice(start, start + PAGE_SIZE);
  }, [filteredRequests, page]);

  // Metric counts
  const pendingCount = useMemo(
    () => requests.filter((r) => (r.status || '').toLowerCase() === 'pending').length,
    [requests],
  );
  const approvedCount = useMemo(
    () => requests.filter((r) => (r.status || '').toLowerCase() === 'approved').length,
    [requests],
  );
  const rejectedCount = useMemo(
    () => requests.filter((r) => (r.status || '').toLowerCase() === 'rejected').length,
    [requests],
  );

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('start_date'));
    const endDate = String(form.get('end_date'));

    if (startDate && endDate && endDate < startDate) {
      setFormError('End date cannot be earlier than start date.');
      setSaving(false);
      return;
    }

    try {
      await client.createLeaveRequest({
        leave_type: String(form.get('leave_type')),
        start_date: startDate,
        end_date: endDate,
        reason: String(form.get('reason')).trim(),
      });
      setModalOpen(false);
      setSuccess('Leave request submitted successfully for approval.');
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const executeReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewDialog || saving) return;

    // Prevent repeated approval actions on non-pending requests
    if (reviewDialog.request.status.toLowerCase() !== 'pending') {
      setFormError('This request has already been processed and cannot be reviewed again.');
      return;
    }

    setSaving(true);
    setFormError('');
    setError('');
    const comment = reviewComment.trim();

    try {
      let updatedData: LeaveRequest | undefined;
      if (reviewDialog.decision === 'approve') {
        const res = await client.approveLeave(reviewDialog.request.public_id, comment);
        updatedData = res.data;
        setSuccess(`Leave request approved for ${reviewDialog.request.employee_name}.`);
      } else {
        const res = await client.rejectLeave(reviewDialog.request.public_id, comment);
        updatedData = res.data;
        setSuccess(`Leave request rejected for ${reviewDialog.request.employee_name}.`);
      }

      if (updatedData && updatedData.public_id) {
        setRequests((prev) =>
          prev.map((r) => (r.public_id === updatedData!.public_id ? updatedData! : r)),
        );
      }

      setReviewDialog(null);
      setReviewComment('');
      await load();
    } catch (cause) {
      const fallback =
        reviewDialog.decision === 'approve'
          ? 'Unable to approve leave. Please try again.'
          : 'Unable to reject leave. Please try again.';
      setFormError(displayError(cause, fallback));
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setEmployeeFilter('');
    setDepartmentFilter('');
    setTypeFilter('');
    setStatusFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? 'Organization Monitoring' : 'Leave Administration'}
        title="Leave Management & Approval"
        description={
          isAdmin
            ? 'Monitor leave applications across the organization, review historical approval decisions, and audit reviewer comments.'
            : 'Review employee leave applications, execute authorized approvals or rejections, and verify department coverage.'
        }
        action={
          canSubmitLeave ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setFormError('');
                setModalOpen(true);
              }}
            >
              <Icon name="plus" size={14} /> Request Leave
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* Admin Monitoring Info Banner */}
      {isAdmin && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 shadow-2xs">
          <Icon name="shield" size={16} className="text-blue-700 shrink-0" />
          <p>
            <strong>Admin Monitoring Mode:</strong> You have comprehensive read-only visibility into all organizational leave records, reviewer identities, and approval history. Approval and rejection actions remain delegated to authorized HR Managers.
          </p>
        </div>
      )}

      {/* KPI Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Icon name="clock" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
              <p className="text-xs font-medium text-slate-500">Pending Review</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon name="check-circle" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{approvedCount}</p>
              <p className="text-xs font-medium text-slate-500">Approved Requests</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
              <Icon name="logout" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{rejectedCount}</p>
              <p className="text-xs font-medium text-slate-500">Rejected Requests</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="calendar" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{requests.length}</p>
              <p className="text-xs font-medium text-slate-500">Total Applications</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card with Tabs and Advanced Filtering */}
      <Card className="overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('all');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Requests ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('pending');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'pending'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pending Action</span>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] text-white">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('approved');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'approved'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approved ({approvedCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('rejected');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'rejected'
                  ? 'bg-white text-rose-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rejected ({rejectedCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('history');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit History ({approvedCount + rejectedCount})
            </button>
          </div>

          <div className="w-full sm:w-64">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search employee, leave type, reason..."
            />
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid gap-3 border-b border-slate-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 text-xs">
          <SelectField
            label="Filter Department"
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.public_id} value={d.name}>
                {d.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Filter Leave Type"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Leave Types</option>
            {leaveTypes.map((t) => (
              <option key={t.public_id} value={t.public_id}>
                {t.name}
              </option>
            ))}
          </SelectField>

          <Field
            label="Start Date From"
            type="date"
            value={startDateFilter}
            onChange={(e) => {
              setStartDateFilter(e.target.value);
              setPage(1);
            }}
          />

          <Field
            label="End Date To"
            type="date"
            value={endDateFilter}
            onChange={(e) => {
              setEndDateFilter(e.target.value);
              setPage(1);
            }}
          />

          <div className="flex items-end">
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-center text-xs"
              onClick={resetFilters}
            >
              Reset Filters
            </Button>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12">
            <LoadingState label="Loading verified leave applications..." />
          </div>
        ) : filteredRequests.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No leave requests match your criteria"
            description="Adjust your filters, search criteria, or select another tab view."
            action={
              canSubmitLeave ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setFormError('');
                    setModalOpen(true);
                  }}
                >
                  <Icon name="plus" size={14} /> Submit Application
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Applicant & Department</th>
                    <th className="px-5 py-3">Leave Type</th>
                    <th className="px-5 py-3">Date Range & Duration</th>
                    <th className="px-5 py-3">Reason / Context</th>
                    <th className="px-5 py-3">Status</th>
                    {(tab === 'history' || isAdmin) && (
                      <th className="px-5 py-3">Reviewer Details</th>
                    )}
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageRows.map((req) => {
                    const emp =
                      (req.employee ? employeeMap.get(String(req.employee)) : undefined) ||
                      employeeMap.get((req.employee_name || '').toLowerCase());
                    const deptName = emp?.department_name || 'General';
                    const isPending = (req.status || '').toLowerCase() === 'pending';

                    return (
                      <tr key={req.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900">{req.employee_name}</p>
                          <p className="text-[11px] text-slate-500 font-medium">{deptName}</p>
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                            {req.leave_type_name}
                          </span>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="font-mono text-[11px] text-slate-800">
                            {formatDate(req.start_date)} - {formatDate(req.end_date)}
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {req.duration ?? '1'} {req.duration === 1 ? 'day' : 'days'}
                          </p>
                        </td>

                        <td className="px-5 py-3.5 max-w-xs">
                          <p className="truncate text-slate-700" title={req.reason}>
                            {req.reason}
                          </p>
                        </td>

                        <td className="px-5 py-3.5">
                          <StatusBadge status={req.status} />
                        </td>

                        {(tab === 'history' || isAdmin) && (
                          <td className="px-5 py-3.5">
                            {req.reviewed_by ? (
                              <div>
                                <p className="font-medium text-slate-800 text-[11px]">
                                  Reviewer ID: #{String(req.reviewed_by).slice(0, 8)}
                                </p>
                                {req.reviewer_comment && (
                                  <p className="text-[10px] text-slate-500 italic truncate max-w-[150px]">
                                    "{req.reviewer_comment}"
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Awaiting review</span>
                            )}
                          </td>
                        )}

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="px-2 py-1 text-[11px]"
                              onClick={() => setSelectedRequest(req)}
                            >
                              Details
                            </Button>

                            {/* Approval actions strictly for authorized HR Managers */}
                            {canApproveOrReject && isPending && (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="px-2 py-1 text-[11px]"
                                  onClick={() => {
                                    setFormError('');
                                    setReviewComment('');
                                    setReviewDialog({ request: req, decision: 'approve' });
                                  }}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  className="px-2 py-1 text-[11px]"
                                  onClick={() => {
                                    setFormError('');
                                    setReviewComment('');
                                    setReviewDialog({ request: req, decision: 'reject' });
                                  }}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
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
              totalItems={filteredRequests.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Request Leave (Not for Admin) */}
      {modalOpen && canSubmitLeave && (
        <Modal
          title="Submit Leave Application"
          description="Send dates, leave classification, and justification to your designated reviewer."
          onClose={() => setModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={submitRequest}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Leave Classification"
              name="leave_type"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select category...
              </option>
              {leaveTypes.map((type) => (
                <option key={type.public_id} value={type.public_id}>
                  {type.name} {type.is_paid ? '(Paid Leave)' : '(Unpaid)'}
                </option>
              ))}
            </SelectField>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Start Date" name="start_date" type="date" required />
              <Field label="End Date" name="end_date" type="date" required />
            </div>

            <TextareaField
              label="Reason & Justification"
              name="reason"
              required
              minLength={5}
              placeholder="Provide context for HR and departmental scheduling..."
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving || leaveTypes.length === 0}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Leave Request Details */}
      {selectedRequest && (
        <Modal
          title="Leave Application Details"
          description={`Application ID: ${selectedRequest.public_id}`}
          onClose={() => setSelectedRequest(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4 border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedRequest.employee_name}</p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {selectedRequest.leave_type_name}
                </p>
              </div>
              <StatusBadge status={selectedRequest.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Duration</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selectedRequest.duration ?? 1} Day(s)
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Date Range</p>
                <p className="mt-1 font-semibold text-slate-800 font-mono text-[11px]">
                  {formatDate(selectedRequest.start_date)} – {formatDate(selectedRequest.end_date)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-white">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Applicant Justification</p>
              <p className="mt-1 leading-relaxed text-slate-800">{selectedRequest.reason}</p>
            </div>

            {selectedRequest.reviewed_by && (
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/70">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Review Audit</p>
                <p className="mt-1 font-medium text-slate-800">
                  Reviewer ID: #{String(selectedRequest.reviewed_by)}
                </p>
                {selectedRequest.reviewer_comment && (
                  <p className="mt-1 text-slate-600 italic">
                    Comment: "{selectedRequest.reviewer_comment}"
                  </p>
                )}
                {selectedRequest.reviewed_at && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Decision Date: {formatDate(selectedRequest.reviewed_at)}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setSelectedRequest(null)}>
                Close
              </Button>
              {canApproveOrReject && selectedRequest.status.toLowerCase() === 'pending' && (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      const req = selectedRequest;
                      setSelectedRequest(null);
                      setFormError('');
                      setReviewComment('');
                      setReviewDialog({ request: req, decision: 'reject' });
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const req = selectedRequest;
                      setSelectedRequest(null);
                      setFormError('');
                      setReviewComment('');
                      setReviewDialog({ request: req, decision: 'approve' });
                    }}
                  >
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Review Decision (Approve or Reject with Comment) */}
      {reviewDialog && (
        <Modal
          title={
            reviewDialog.decision === 'approve'
              ? 'Approve Leave Application'
              : 'Reject Leave Application'
          }
          description={`Applicant: ${reviewDialog.request.employee_name} • ${reviewDialog.request.leave_type_name}`}
          onClose={() => setReviewDialog(null)}
        >
          <form className="space-y-4" onSubmit={executeReview}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200/80 text-xs text-slate-700">
              <p className="font-semibold text-slate-800">Application Reason:</p>
              <p className="mt-1 leading-relaxed">{reviewDialog.request.reason}</p>
            </div>

            <TextareaField
              label={
                reviewDialog.decision === 'approve'
                  ? 'Reviewer Comments (Optional)'
                  : 'Rejection Reason / Remarks (Required)'
              }
              name="comment"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              required={reviewDialog.decision === 'reject'}
              placeholder={
                reviewDialog.decision === 'approve'
                  ? 'Add remarks or handover notes...'
                  : 'Explain the reason for rejection (e.g. scheduling conflict, insufficient balance)...'
              }
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setReviewDialog(null)}
              >
                Cancel
              </Button>
              <Button
                variant={reviewDialog.decision === 'approve' ? 'primary' : 'danger'}
                disabled={saving}
              >
                {saving
                  ? 'Processing...'
                  : reviewDialog.decision === 'approve'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
