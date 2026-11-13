import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Employee, PerformanceMetric, ReviewCycle, Scorecard } from '../api/types';
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

type TabView = 'all' | 'draft' | 'submitted';
const PAGE_SIZE = 8;

type MetricRow = PerformanceMetric & { key: string };

function emptyMetricRow(): MetricRow {
  return { key: Math.random().toString(36).slice(2), metric_name: '', target: '', actual: '', weight: 0 };
}

export default function PerformancePage() {
  const { user, hasRole } = useAuth();
  const isAdmin = Boolean(
    user?.is_superuser || user?.role_name === 'System Admin' || hasRole(['System Admin']),
  );
  const isHR = user?.role_name === 'HR Manager' || hasRole(['HR Manager']);
  const isManagerRole =
    user?.role_name === 'Department / Project Manager' ||
    hasRole(['Department / Project Manager']);
  const isPlainEmployee = !isAdmin && !isHR && !isManagerRole;

  // HR (not Admin, which only monitors) owns review cycle configuration.
  const canManageCycles = isHR;
  // HR and direct-line managers can author scorecards; Admin only monitors.
  const canCreateScorecard = isHR || isManagerRole;

  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tab, setTab] = useState<TabView>('all');
  const [search, setSearch] = useState('');
  const [cycleFilter, setCycleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [page, setPage] = useState(1);

  // Scorecard create/edit modal
  const [scorecardModalOpen, setScorecardModalOpen] = useState(false);
  const [editingScorecard, setEditingScorecard] = useState<Scorecard | null>(null);
  const [metricRows, setMetricRows] = useState<MetricRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Review cycle modal (HR only)
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<ReviewCycle | null>(null);

  // Details & submit confirmation
  const [selectedScorecard, setSelectedScorecard] = useState<Scorecard | null>(null);
  const [submitTarget, setSubmitTarget] = useState<Scorecard | null>(null);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) map.set(emp.public_id, emp);
    return map;
  }, [employees]);

  const myEmployee = useMemo(
    () => (user?.employee_public_id ? employeeMap.get(user.employee_public_id) : undefined),
    [employeeMap, user],
  );

  const directReports = useMemo(
    () => (myEmployee ? employees.filter((e) => e.manager === myEmployee.public_id) : []),
    [employees, myEmployee],
  );

  const load = useCallback(async () => {
    try {
      const [cycleRes, cardRes, empRes] = await Promise.allSettled([
        client.reviewCycles(),
        client.scorecards(),
        client.employees(),
      ]);

      if (cycleRes.status === 'fulfilled') {
        setCycles(unwrapList(cycleRes.value.data));
      } else {
        setError(displayError(cycleRes.reason));
      }
      if (cardRes.status === 'fulfilled') {
        setScorecards(unwrapList(cardRes.value.data));
      } else {
        setError((prev) => prev || displayError(cardRes.reason));
      }
      if (empRes.status === 'fulfilled') {
        setEmployees(unwrapList(empRes.value.data));
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

  // A plain employee only sees reviews their manager has actually finalized.
  const visibleScorecards = useMemo(() => {
    if (!isPlainEmployee) return scorecards;
    return scorecards.filter((s) => s.status === 'SUBMITTED');
  }, [scorecards, isPlainEmployee]);

  const tabFilteredScorecards = useMemo(() => {
    return visibleScorecards.filter((item) => {
      if (tab === 'draft') return item.status === 'DRAFT';
      if (tab === 'submitted') return item.status === 'SUBMITTED';
      return true;
    });
  }, [visibleScorecards, tab]);

  const filteredScorecards = useMemo(() => {
    return tabFilteredScorecards.filter((item) => {
      const emp = employeeMap.get(item.employee);
      const deptName = emp?.department_name || '';

      const matchesSearch =
        !search ||
        (item.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.cycle_label || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.goals || '').toLowerCase().includes(search.toLowerCase());

      const matchesCycle = !cycleFilter || item.cycle === cycleFilter;
      const matchesDepartment = !departmentFilter || deptName === departmentFilter;

      return matchesSearch && matchesCycle && matchesDepartment;
    });
  }, [tabFilteredScorecards, employeeMap, search, cycleFilter, departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredScorecards.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredScorecards.slice(start, start + PAGE_SIZE);
  }, [filteredScorecards, page]);

  const draftCount = useMemo(
    () => visibleScorecards.filter((s) => s.status === 'DRAFT').length,
    [visibleScorecards],
  );
  const submittedCount = useMemo(
    () => visibleScorecards.filter((s) => s.status === 'SUBMITTED').length,
    [visibleScorecards],
  );
  const avgRating = useMemo(() => {
    const rated = visibleScorecards.filter((s) => s.status === 'SUBMITTED' && s.rating);
    if (rated.length === 0) return null;
    const total = rated.reduce((sum, s) => sum + Number(s.rating || 0), 0);
    return (total / rated.length).toFixed(1);
  }, [visibleScorecards]);

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const e of employees) if (e.department_name) names.add(e.department_name);
    return Array.from(names).sort();
  }, [employees]);

  const assignableEmployees = isHR ? employees : directReports;

  const resetFilters = () => {
    setSearch('');
    setCycleFilter('');
    setDepartmentFilter('');
    setPage(1);
  };

  const openCreateScorecard = () => {
    setFormError('');
    setEditingScorecard(null);
    setMetricRows([]);
    setScorecardModalOpen(true);
  };

  const openEditScorecard = (scorecard: Scorecard) => {
    setFormError('');
    setEditingScorecard(scorecard);
    setMetricRows(
      (scorecard.metrics || []).map((m) => ({ ...m, key: m.public_id || Math.random().toString(36).slice(2) })),
    );
    setScorecardModalOpen(true);
  };

  const addMetricRow = () => setMetricRows((rows) => [...rows, emptyMetricRow()]);
  const removeMetricRow = (key: string) => setMetricRows((rows) => rows.filter((r) => r.key !== key));
  const updateMetricRow = (key: string, field: keyof PerformanceMetric, value: string) => {
    setMetricRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, [field]: field === 'weight' ? Number(value) : value } : r)),
    );
  };

  const saveScorecard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    const ratingRaw = String(form.get('rating') || '');

    const metrics = metricRows
      .filter((row) => row.metric_name.trim())
      .map(({ metric_name, target, actual, weight }) => ({
        metric_name: metric_name.trim(),
        target: target || 0,
        actual: actual || 0,
        weight: Number(weight) || 0,
      }));

    const payload: Record<string, unknown> = {
      goals: String(form.get('goals') || '').trim(),
      rating: ratingRaw ? Number(ratingRaw) : null,
      metrics,
    };

    if (!editingScorecard) {
      payload.employee = String(form.get('employee'));
      payload.cycle = String(form.get('cycle'));
    }

    try {
      if (editingScorecard) {
        await client.updateScorecard(editingScorecard.public_id, payload);
        setSuccess(`Scorecard for ${editingScorecard.employee_name} updated.`);
      } else {
        await client.createScorecard(payload);
        setSuccess('Scorecard created as a draft.');
      }
      setScorecardModalOpen(false);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const executeSubmit = async () => {
    if (!submitTarget) return;
    setSaving(true);
    setFormError('');
    try {
      await client.submitScorecard(submitTarget.public_id);
      setSuccess(`Scorecard for ${submitTarget.employee_name} submitted.`);
      setSubmitTarget(null);
      setSelectedScorecard(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause, 'Unable to submit this scorecard.'));
    } finally {
      setSaving(false);
    }
  };

  const saveCycle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('start_date'));
    const endDate = String(form.get('end_date'));

    if (startDate && endDate && endDate < startDate) {
      setFormError('End date cannot be earlier than start date.');
      setSaving(false);
      return;
    }

    const payload = {
      period_type: String(form.get('period_type')),
      period_label: String(form.get('period_label')).trim(),
      start_date: startDate,
      end_date: endDate,
    };

    try {
      if (editingCycle) {
        await client.updateReviewCycle(editingCycle.public_id, payload);
        setSuccess(`Review cycle "${payload.period_label}" updated.`);
      } else {
        await client.createReviewCycle(payload);
        setSuccess(`Review cycle "${payload.period_label}" created.`);
      }
      setCycleModalOpen(false);
      setEditingCycle(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleCycleClosed = async (cycle: ReviewCycle) => {
    try {
      await client.updateReviewCycle(cycle.public_id, { is_closed: !cycle.is_closed });
      setSuccess(`Review cycle "${cycle.period_label}" ${cycle.is_closed ? 'reopened' : 'closed'}.`);
      await load();
    } catch (cause) {
      setError(displayError(cause));
    }
  };

  const canEditScorecard = (scorecard: Scorecard) => {
    if (isAdmin) return false;
    if (isHR) return true;
    if (scorecard.status !== 'DRAFT') return false;
    return isManagerRole && myEmployee?.public_id === scorecard.reviewer;
  };

  const canSubmitScorecard = (scorecard: Scorecard) =>
    scorecard.status === 'DRAFT' && (isHR || (isManagerRole && myEmployee?.public_id === scorecard.reviewer));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? 'Organization Monitoring' : 'Performance Administration'}
        title="Employee Performance Management"
        description={
          isAdmin
            ? 'Monitor performance scorecards and rating rollups across the organization.'
            : isHR
            ? 'Configure review cycles and oversee performance scorecards across the organization.'
            : isManagerRole
            ? "Author and submit performance scorecards for your direct reports."
            : 'View the performance feedback shared with you by your manager.'
        }
        action={
          canCreateScorecard ? (
            <Button variant="primary" size="sm" onClick={openCreateScorecard} disabled={cycles.length === 0}>
              <Icon name="plus" size={14} /> New Scorecard
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {isAdmin && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 shadow-2xs">
          <Icon name="shield" size={16} className="text-blue-700 shrink-0" />
          <p>
            <strong>Admin Monitoring Mode:</strong> Review cycle configuration and scorecard authoring remain
            delegated to HR Managers and direct-line managers.
          </p>
        </div>
      )}

      {/* KPI Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Icon name="edit" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{draftCount}</p>
              <p className="text-xs font-medium text-slate-500">Draft Scorecards</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon name="check-circle" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{submittedCount}</p>
              <p className="text-xs font-medium text-slate-500">Submitted Scorecards</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="star" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{avgRating ?? '—'}</p>
              <p className="text-xs font-medium text-slate-500">Average Rating (Submitted)</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Icon name="users" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{visibleScorecards.length}</p>
              <p className="text-xs font-medium text-slate-500">Total Scorecards</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Review Cycles (HR configuration, read-only for everyone else) */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Review Cycles</h3>
          {canManageCycles && (
            <Button
              size="sm"
              variant="secondary"
              className="px-2.5 py-1 text-[11px]"
              onClick={() => {
                setFormError('');
                setEditingCycle(null);
                setCycleModalOpen(true);
              }}
            >
              <Icon name="plus" size={13} /> New Cycle
            </Button>
          )}
        </div>
        {cycles.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            No review cycles exist yet.{' '}
            {canManageCycles ? 'Create one to start collecting performance scorecards.' : ''}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Cycle</th>
                  <th className="px-5 py-2.5">Type</th>
                  <th className="px-5 py-2.5">Window</th>
                  <th className="px-5 py-2.5">Status</th>
                  {canManageCycles && <th className="px-5 py-2.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {cycles.map((cycle) => (
                  <tr key={cycle.public_id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-2.5 font-semibold text-slate-900">{cycle.period_label}</td>
                    <td className="px-5 py-2.5">{cycle.period_type}</td>
                    <td className="px-5 py-2.5 font-mono text-[11px]">
                      {formatDate(cycle.start_date)} – {formatDate(cycle.end_date)}
                    </td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={cycle.is_closed ? 'Closed' : 'Active'} />
                    </td>
                    {canManageCycles && (
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="px-2 py-1 text-[11px]"
                          onClick={() => toggleCycleClosed(cycle)}
                        >
                          {cycle.is_closed ? 'Reopen' : 'Close'}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Scorecards */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('all');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({visibleScorecards.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('draft');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'draft' ? 'bg-white text-amber-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Draft ({draftCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('submitted');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'submitted' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Submitted ({submittedCount})
            </button>
          </div>
          <div className="w-full sm:w-64">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search employee, cycle, goals..."
            />
          </div>
        </div>

        {(isHR || isAdmin) && (
          <div className="grid gap-3 border-b border-slate-100 bg-white p-4 sm:grid-cols-3 text-xs">
            <SelectField
              label="Filter Cycle"
              value={cycleFilter}
              onChange={(e) => {
                setCycleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Cycles</option>
              {cycles.map((c) => (
                <option key={c.public_id} value={c.public_id}>
                  {c.period_label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Filter Department"
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Departments</option>
              {departmentOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
            <div className="flex items-end">
              <Button variant="secondary" size="sm" className="w-full justify-center text-xs" onClick={resetFilters}>
                Reset Filters
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12">
            <LoadingState label="Loading performance scorecards..." />
          </div>
        ) : filteredScorecards.length === 0 ? (
          <EmptyState
            icon="star"
            title="No scorecards match your criteria"
            description={
              canCreateScorecard
                ? 'Create a scorecard for a direct report once a review cycle is open.'
                : 'Your manager has not shared any performance feedback yet.'
            }
            action={
              canCreateScorecard ? (
                <Button size="sm" onClick={openCreateScorecard} disabled={cycles.length === 0}>
                  <Icon name="plus" size={14} /> New Scorecard
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
                    <th className="px-5 py-3">Employee & Department</th>
                    <th className="px-5 py-3">Cycle</th>
                    <th className="px-5 py-3">Reviewer</th>
                    <th className="px-5 py-3">Rating</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageRows.map((card) => {
                    const emp = employeeMap.get(card.employee);
                    const deptName = emp?.department_name || 'General';

                    return (
                      <tr key={card.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900">{card.employee_name}</p>
                          <p className="text-[11px] text-slate-500 font-medium">{deptName}</p>
                        </td>
                        <td className="px-5 py-3.5">{card.cycle_label}</td>
                        <td className="px-5 py-3.5">{card.reviewer_name || '—'}</td>
                        <td className="px-5 py-3.5">
                          {card.rating ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                              <Icon name="star" size={12} className="text-amber-500" /> {card.rating}/5
                            </span>
                          ) : (
                            <span className="text-slate-400">Not rated</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={card.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="px-2 py-1 text-[11px]"
                              onClick={() => setSelectedScorecard(card)}
                            >
                              Details
                            </Button>
                            {canEditScorecard(card) && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="px-2 py-1 text-[11px]"
                                onClick={() => openEditScorecard(card)}
                              >
                                Edit
                              </Button>
                            )}
                            {canSubmitScorecard(card) && (
                              <Button
                                size="sm"
                                variant="primary"
                                className="px-2 py-1 text-[11px]"
                                onClick={() => {
                                  setFormError('');
                                  setSubmitTarget(card);
                                }}
                              >
                                Submit
                              </Button>
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
              totalItems={filteredScorecards.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Create / Edit Scorecard */}
      {scorecardModalOpen && (
        <Modal
          title={editingScorecard ? 'Edit Scorecard' : 'New Performance Scorecard'}
          description={
            editingScorecard
              ? `${editingScorecard.employee_name} · ${editingScorecard.cycle_label}`
              : 'Draft goals and a rating for a direct report. Submit when ready to finalize.'
          }
          onClose={() => setScorecardModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={saveScorecard}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            {!editingScorecard && (
              <div className="grid gap-3.5 sm:grid-cols-2">
                <SelectField label="Employee" name="employee" required defaultValue="">
                  <option value="" disabled>
                    Select employee...
                  </option>
                  {assignableEmployees.map((emp) => (
                    <option key={emp.public_id} value={emp.public_id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Review Cycle" name="cycle" required defaultValue="">
                  <option value="" disabled>
                    Select cycle...
                  </option>
                  {cycles
                    .filter((c) => !c.is_closed)
                    .map((c) => (
                      <option key={c.public_id} value={c.public_id}>
                        {c.period_label}
                      </option>
                    ))}
                </SelectField>
              </div>
            )}

            <TextareaField
              label="Goals & Narrative Feedback"
              name="goals"
              required
              minLength={5}
              defaultValue={editingScorecard?.goals || ''}
              placeholder="Summarize goals, achievements, and areas for growth..."
            />

            <SelectField label="Overall Rating" name="rating" defaultValue={editingScorecard?.rating ? String(editingScorecard.rating) : ''}>
              <option value="">Not yet rated</option>
              <option value="1">1 - Unsatisfactory</option>
              <option value="2">2 - Needs Improvement</option>
              <option value="3">3 - Meets Expectations</option>
              <option value="4">4 - Exceeds Expectations</option>
              <option value="5">5 - Outstanding</option>
            </SelectField>

            <div className="rounded-lg border border-slate-200 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">Weighted Goals (Optional)</p>
                <Button type="button" size="sm" variant="secondary" className="px-2 py-1 text-[11px]" onClick={addMetricRow}>
                  <Icon name="plus" size={12} /> Add Goal
                </Button>
              </div>
              {metricRows.length > 0 && (
                <div className="mt-3 space-y-2">
                  {metricRows.map((row) => (
                    <div key={row.key} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <Field
                          label="Metric"
                          value={row.metric_name}
                          onChange={(e) => updateMetricRow(row.key, 'metric_name', e.target.value)}
                          placeholder="e.g. On-time delivery"
                        />
                      </div>
                      <div className="col-span-2">
                        <Field
                          label="Target"
                          value={String(row.target)}
                          onChange={(e) => updateMetricRow(row.key, 'target', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Field
                          label="Actual"
                          value={String(row.actual)}
                          onChange={(e) => updateMetricRow(row.key, 'actual', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Field
                          label="Weight %"
                          type="number"
                          value={String(row.weight)}
                          onChange={(e) => updateMetricRow(row.key, 'weight', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 pb-1.5">
                        <button
                          type="button"
                          onClick={() => removeMetricRow(row.key)}
                          className="flex size-7 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50"
                          aria-label="Remove goal"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setScorecardModalOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Create / Edit Review Cycle */}
      {cycleModalOpen && (
        <Modal
          title={editingCycle ? 'Edit Review Cycle' : 'New Review Cycle'}
          description="Define the window in which managers can author and submit scorecards."
          onClose={() => setCycleModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={saveCycle}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <SelectField label="Period Type" name="period_type" required defaultValue={editingCycle?.period_type || ''}>
              <option value="" disabled>
                Select type...
              </option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Annual</option>
            </SelectField>
            <Field
              label="Period Label"
              name="period_label"
              required
              defaultValue={editingCycle?.period_label || ''}
              placeholder="e.g. Q1 2026"
            />
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Start Date" name="start_date" type="date" required defaultValue={editingCycle?.start_date || ''} />
              <Field label="End Date" name="end_date" type="date" required defaultValue={editingCycle?.end_date || ''} />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setCycleModalOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? 'Saving...' : 'Save Cycle'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Scorecard Details */}
      {selectedScorecard && (
        <Modal
          title="Scorecard Details"
          description={`${selectedScorecard.employee_name} · ${selectedScorecard.cycle_label}`}
          onClose={() => setSelectedScorecard(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4 border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedScorecard.employee_name}</p>
                <p className="text-[11px] text-slate-500 font-medium">
                  Reviewer: {selectedScorecard.reviewer_name || 'Unassigned'}
                </p>
              </div>
              <StatusBadge status={selectedScorecard.status} />
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-white">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Overall Rating</p>
              <p className="mt-1 font-semibold text-slate-800">
                {selectedScorecard.rating ? selectedScorecard.rating_label : 'Not yet rated'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-white">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Goals & Narrative Feedback</p>
              <p className="mt-1 leading-relaxed text-slate-800 whitespace-pre-wrap">{selectedScorecard.goals}</p>
            </div>

            {selectedScorecard.metrics && selectedScorecard.metrics.length > 0 && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Metric</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Actual</th>
                      <th className="px-3 py-2">Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedScorecard.metrics.map((m) => (
                      <tr key={m.public_id || m.metric_name}>
                        <td className="px-3 py-2 font-medium text-slate-800">{m.metric_name}</td>
                        <td className="px-3 py-2">{m.target}</td>
                        <td className="px-3 py-2">{m.actual}</td>
                        <td className="px-3 py-2">{m.weight}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedScorecard.submitted_at && (
              <p className="text-[11px] text-slate-400">
                Submitted on {formatDate(selectedScorecard.submitted_at)}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setSelectedScorecard(null)}>
                Close
              </Button>
              {canEditScorecard(selectedScorecard) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const card = selectedScorecard;
                    setSelectedScorecard(null);
                    openEditScorecard(card);
                  }}
                >
                  Edit
                </Button>
              )}
              {canSubmitScorecard(selectedScorecard) && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setFormError('');
                    setSubmitTarget(selectedScorecard);
                  }}
                >
                  Submit
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Confirm Submit */}
      {submitTarget && (
        <Modal
          title="Submit Scorecard"
          description={`${submitTarget.employee_name} · ${submitTarget.cycle_label}`}
          onClose={() => setSubmitTarget(null)}
        >
          <div className="space-y-4 text-xs">
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <p className="text-slate-700">
              Submitting finalizes this scorecard and shares it with the employee. Draft edits will no longer be
              possible once submitted.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setSubmitTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={saving} onClick={executeSubmit}>
                {saving ? 'Submitting...' : 'Confirm Submit'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
