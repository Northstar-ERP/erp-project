import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../../api/client';
import type { Employee, LeaveRequest, Project, Task } from '../../api/types';
import { displayError, formatDate, initials } from '../../components/format';
import { useAuth } from '../../context/auth';
import {
  calculateEmployeeAvailability,
  type EmployeeAvailabilityResult,
} from '../../utils/availability';
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
  SuccessMessage,
  TextareaField,
} from '../../components/ui';

const PAGE_SIZE = 10;

export default function EmployeeAvailabilityPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Date range filters for availability evaluation
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [defaultEndStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  const [periodStart, setPeriodStart] = useState(todayStr);
  const [periodEnd, setPeriodEnd] = useState(defaultEndStr);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Quick Assign Task Modal
  const [assignModalEmployee, setAssignModalEmployee] = useState<Employee | null>(null);
  const [selectedDetailsEmployee, setSelectedDetailsEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Derive unique departments directly from employee profiles (avoids restricted /api/organization/departments/ call)
  const availableDepartments = useMemo(() => {
    const names = new Set<string>();
    for (const emp of employees) {
      if (emp.department_name) {
        names.add(emp.department_name);
      }
    }
    return Array.from(names).sort();
  }, [employees]);

  const loadData = useCallback(async () => {
    try {
      const [empRes, taskRes, projRes, leaveRes] = await Promise.all([
        client.employees(),
        client.tasks(),
        client.projects(),
        client.leaveRequests(),
      ]);
      setEmployees(unwrapList(empRes.data));
      setTasks(unwrapList(taskRes.data));
      setProjects(unwrapList(projRes.data));
      setLeaves(unwrapList(leaveRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // Current PM Employee ID
  const currentEmployee = useMemo(() => {
    return employees.find(
      (e) =>
        e.public_id === user?.employee_public_id ||
        e.user_details?.username === user?.username ||
        e.email === user?.email,
    );
  }, [employees, user]);

  const projectMap = useMemo(() => {
    return new Map(projects.map((p) => [p.public_id, p]));
  }, [projects]);

  // Precompute availability for all employees
  const availabilityMap = useMemo(() => {
    const map = new Map<string, EmployeeAvailabilityResult>();
    for (const emp of employees) {
      const res = calculateEmployeeAvailability(
        emp,
        tasks,
        leaves,
        currentEmployee?.public_id,
        periodStart,
        periodEnd,
      );
      map.set(emp.public_id, res);
    }
    return map;
  }, [employees, tasks, leaves, currentEmployee, periodStart, periodEnd]);

  // Projects per employee (projects they manage or have active tasks in)
  const employeeProjectsMap = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const emp of employees) {
      const projSet = new Set<string>();
      // Check managed
      for (const p of projects) {
        if (p.manager === emp.public_id || p.manager_details?.public_id === emp.public_id) {
          projSet.add(p.public_id);
        }
      }
      // Check tasks
      for (const t of tasks) {
        if (
          (t.assigned_to === emp.public_id || t.assigned_to_details?.public_id === emp.public_id) &&
          t.project
        ) {
          projSet.add(t.project);
        }
      }
      const pList: Project[] = [];
      for (const pId of projSet) {
        const p = projectMap.get(pId);
        if (p) pList.push(p);
      }
      map.set(emp.public_id, pList);
    }
    return map;
  }, [employees, projects, tasks, projectMap]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const avail = availabilityMap.get(emp.public_id);
      const empProjects = employeeProjectsMap.get(emp.public_id) || [];

      // Status filter
      if (statusFilter && avail?.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Department filter
      if (deptFilter && emp.department_name !== deptFilter && emp.department !== deptFilter) {
        return false;
      }

      // Project filter
      if (projectFilter) {
        const hasProject = empProjects.some((p) => p.public_id === projectFilter);
        if (!hasProject) return false;
      }

      // Search filter
      if (search) {
        const query = search.toLowerCase();
        const name = `${emp.first_name} ${emp.last_name}`.toLowerCase();
        const title = (emp.job_title || '').toLowerCase();
        const dept = (emp.department_name || '').toLowerCase();
        if (!name.includes(query) && !title.includes(query) && !dept.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [employees, availabilityMap, employeeProjectsMap, statusFilter, deptFilter, projectFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const pageEmployees = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEmployees.slice(start, start + PAGE_SIZE);
  }, [filteredEmployees, page]);

  // Preset date helpers
  const setPresetDays = (days: number) => {
    const start = todayStr;
    const end = new Date();
    end.setDate(end.getDate() + days);
    setPeriodStart(start);
    setPeriodEnd(end.toISOString().slice(0, 10));
    setPage(1);
  };

  // KPI calculations
  const totalEmployeesCount = employees.length;
  const availableCount = Array.from(availabilityMap.values()).filter(
    (a) => a.status === 'Available',
  ).length;
  const busyCount = Array.from(availabilityMap.values()).filter(
    (a) => a.status === 'Busy',
  ).length;
  const onLeaveCount = Array.from(availabilityMap.values()).filter(
    (a) => a.status === 'On Leave',
  ).length;
  const unknownCount = Array.from(availabilityMap.values()).filter(
    (a) => a.status === 'Unknown' || a.status === 'Unavailable',
  ).length;

  // Handle Quick Task Assignment
  const handleAssignTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!assignModalEmployee) return;

    setSaving(true);
    setFormError('');
    setError('');

    const form = new FormData(e.currentTarget);
    const project = String(form.get('project') || '').trim();
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    const deadline = String(form.get('deadline') || '').trim() || null;
    const status = String(form.get('status') || 'To Do').trim();

    if (!project) {
      setFormError('Target project is required.');
      setSaving(false);
      return;
    }
    if (!title) {
      setFormError('Task title is required.');
      setSaving(false);
      return;
    }

    const targetProject = projectMap.get(project);
    if (targetProject && deadline) {
      if (targetProject.start_date && deadline < targetProject.start_date) {
        setFormError(
          `Task deadline cannot be before project start date (${targetProject.start_date}).`,
        );
        setSaving(false);
        return;
      }
      if (targetProject.end_date && deadline > targetProject.end_date) {
        setFormError(
          `Task deadline cannot be after project end date (${targetProject.end_date}).`,
        );
        setSaving(false);
        return;
      }
    }

    try {
      const { data: createdTask } = await client.createTask({
        project,
        assigned_to: assignModalEmployee.public_id,
        title,
        description: description || null,
        deadline,
        status,
      });

      setTasks((prev) => [createdTask, ...prev]);
      setSuccess(
        `Task "${title}" scheduled and assigned to ${assignModalEmployee.first_name} ${assignModalEmployee.last_name}.`,
      );
      setAssignModalEmployee(null);
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workload & Resource Intelligence"
        title="Employee Availability"
        description="Verify employee availability, existing project commitments, and approved leave schedules before assigning tasks."
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* Date Range Evaluation Controller */}
      <Card className="p-4 sm:p-5 border-blue-200/80 bg-linear-to-r from-blue-50/40 via-white to-slate-50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
              <Icon name="calendar" size={17} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Assignment Evaluation Period
              </p>
              <p className="text-[11px] text-slate-500">
                Checking task deadlines and approved leave overlaps within this date range:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
              <span className="text-xs font-semibold text-slate-600">From</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  setPage(1);
                }}
                className="text-xs font-mono font-medium text-slate-900 outline-hidden"
              />
              <span className="text-xs font-semibold text-slate-400">→</span>
              <span className="text-xs font-semibold text-slate-600">To</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setPage(1);
                }}
                className="text-xs font-mono font-medium text-slate-900 outline-hidden"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPresetDays(7)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setPresetDays(14)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                14 Days
              </button>
              <button
                type="button"
                onClick={() => setPresetDays(30)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                30 Days
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Deck */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-slate-500">Total Workforce</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalEmployeesCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Enrolled staff members</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-emerald-600">Available</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{availableCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Free for new tasks</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-amber-600">Busy</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{busyCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Conflicting tasks / workload</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-purple-600">On Approved Leave</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">{onLeaveCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Leave overlaps period</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-slate-500">Unverified / Unavailable</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{unknownCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Data restricted / inactive</p>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden">
        {/* Filter controls */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search team member…"
              className="w-full sm:w-56"
            />

            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by department"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Departments</option>
              {availableDepartments.map((deptName) => (
                <option key={deptName} value={deptName}>
                  {deptName}
                </option>
              ))}
            </select>

            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by current project"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Current Projects</option>
              {projects.map((p) => (
                <option key={p.public_id} value={p.public_id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by availability status"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Availability Statuses</option>
              <option value="Available">Available</option>
              <option value="Busy">Busy</option>
              <option value="On Leave">On Leave</option>
              <option value="Unknown">Unknown / Unavailable</option>
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Computing real-time employee availability…" />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon="users"
            title="No employee records match filters"
            description="Adjust search keywords or availability filters."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Employee Name</th>
                    <th className="px-5 py-3">Department & Role</th>
                    <th className="px-5 py-3">Current Project(s)</th>
                    <th className="px-5 py-3">Assigned Tasks</th>
                    <th className="px-5 py-3">Task Schedule</th>
                    <th className="px-5 py-3">Leave Status</th>
                    <th className="px-5 py-3">Availability Status</th>
                    <th className="px-5 py-3">Upcoming Availability</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageEmployees.map((emp) => {
                    const avail = availabilityMap.get(emp.public_id);
                    const empProjects = employeeProjectsMap.get(emp.public_id) || [];
                    const activeTasks = (avail?.activeTasks || []).filter(
                      (t) => (t.status || '').toLowerCase() !== 'done',
                    );

                    return (
                      <tr key={emp.public_id} className="hover:bg-slate-50/70 transition">
                        {/* 1. Employee Name */}
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDetailsEmployee(emp)}
                            className="text-left group flex items-center gap-2.5"
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-[10px]">
                              {initials(`${emp.first_name} ${emp.last_name}`)}
                            </span>
                            <div>
                              <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition">
                                {emp.first_name} {emp.last_name}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {emp.email || 'No email configured'}
                              </p>
                            </div>
                          </button>
                        </td>

                        {/* 2. Department & Role */}
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-900">
                            {emp.job_title || 'Team Member'}
                          </p>
                          <p className="text-[10px] text-blue-600 font-medium">
                            {emp.department_name || 'Global Staff'}
                          </p>
                        </td>

                        {/* 3. Current Project */}
                        <td className="px-5 py-3.5">
                          {empProjects.length === 0 ? (
                            <span className="text-slate-400 italic">No assigned project</span>
                          ) : (
                            <div className="flex flex-col gap-1 max-w-[140px]">
                              {empProjects.slice(0, 2).map((p) => (
                                <span
                                  key={p.public_id}
                                  className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                                  title={p.name}
                                >
                                  {p.name}
                                </span>
                              ))}
                              {empProjects.length > 2 && (
                                <span className="text-[9px] text-slate-400">
                                  +{empProjects.length - 2} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. Assigned Tasks */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                activeTasks.length > 2
                                  ? 'bg-amber-100 text-amber-800'
                                  : activeTasks.length > 0
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {activeTasks.length} active
                            </span>
                          </div>
                        </td>

                        {/* 5. Task Schedule */}
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                          {activeTasks.length === 0 ? (
                            <span className="text-slate-400 italic font-sans text-xs">
                              No deadlines
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              {activeTasks.slice(0, 2).map((t) => (
                                <p key={t.public_id} className="truncate max-w-[120px]">
                                  {formatDate(t.deadline)}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* 6. Leave Status */}
                        <td className="px-5 py-3.5">
                          {avail?.approvedLeaves && avail.approvedLeaves.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                              <Icon name="calendar" size={11} />
                              On Leave ({formatDate(avail.approvedLeaves[0].end_date)})
                            </span>
                          ) : avail?.pendingLeaves && avail.pendingLeaves.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Pending Review
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">No active leave</span>
                          )}
                        </td>

                        {/* 7. Availability Status */}
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              avail?.status === 'Available'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : avail?.status === 'Busy'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : avail?.status === 'On Leave'
                                    ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <span
                              className={`size-1.5 rounded-full ${
                                avail?.status === 'Available'
                                  ? 'bg-emerald-500'
                                  : avail?.status === 'Busy'
                                    ? 'bg-amber-500'
                                    : avail?.status === 'On Leave'
                                      ? 'bg-purple-500'
                                      : 'bg-slate-400'
                              }`}
                            />
                            {avail?.statusLabel}
                          </span>
                        </td>

                        {/* 8. Upcoming Availability */}
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-700">
                          {avail?.upcomingAvailableDate === 'Immediate' ? (
                            <span className="text-emerald-700 font-semibold font-sans">
                              Immediate
                            </span>
                          ) : (
                            formatDate(avail?.upcomingAvailableDate)
                          )}
                        </td>

                        {/* 9. Action */}
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setFormError('');
                              setAssignModalEmployee(emp);
                            }}
                          >
                            <Icon name="plus" size={13} /> Assign
                          </Button>
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
              totalItems={filteredEmployees.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Quick Task Assignment for an Employee */}
      {assignModalEmployee && (
        <Modal
          title={`Assign Task to ${assignModalEmployee.first_name} ${assignModalEmployee.last_name}`}
          description="Create a project deliverable for this team member after reviewing current workload."
          onClose={() => setAssignModalEmployee(null)}
        >
          <form className="space-y-4" onSubmit={handleAssignTask}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            {/* Availability Warning */}
            {availabilityMap.get(assignModalEmployee.public_id)?.status === 'On Leave' && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-xs text-purple-800">
                <span className="font-bold">On Leave Warning:</span> This team member has an
                approved leave during the selected evaluation window.
              </div>
            )}

            {availabilityMap.get(assignModalEmployee.public_id)?.status === 'Busy' && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <span className="font-bold">Workload Warning:</span> This employee already has
                scheduled deliverables in this timeframe.
              </div>
            )}

            <SelectField label="Associated Project" name="project" required defaultValue="">
              <option value="" disabled>
                Select target project…
              </option>
              {projects.map((p) => (
                <option key={p.public_id} value={p.public_id}>
                  {p.name} ({p.start_date} to {p.end_date || 'Ongoing'})
                </option>
              ))}
            </SelectField>

            <Field
              label="Deliverable Task Title"
              name="title"
              required
              placeholder="e.g. Conduct security audit for API endpoints"
            />

            <TextareaField
              label="Task Scope & Requirements"
              name="description"
              placeholder="Provide technical specifications and deliverables…"
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Target Deadline"
                name="deadline"
                type="date"
                defaultValue={periodEnd}
              />

              <SelectField label="Initial Status" name="status" defaultValue="To Do">
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Done">Done</option>
              </SelectField>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setAssignModalEmployee(null)}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Scheduling…' : 'Schedule Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Employee Workload Details */}
      {selectedDetailsEmployee && (
        <Modal
          title={`${selectedDetailsEmployee.first_name} ${selectedDetailsEmployee.last_name}`}
          description="Detailed workload profile, assigned projects, and scheduled deadlines."
          onClose={() => setSelectedDetailsEmployee(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Department</p>
                <p className="font-semibold text-slate-800">
                  {selectedDetailsEmployee.department_name || 'Global'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Job Title</p>
                <p className="font-semibold text-slate-800">
                  {selectedDetailsEmployee.job_title || 'Team Member'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Employment Status</p>
                <p className="font-semibold text-slate-800">
                  {selectedDetailsEmployee.employment_status}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">
                  Computed Availability
                </p>
                <p className="font-semibold text-slate-800">
                  {availabilityMap.get(selectedDetailsEmployee.public_id)?.statusLabel}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                Assigned Deliverables (
                {
                  tasks.filter(
                    (t) =>
                      (t.assigned_to === selectedDetailsEmployee.public_id ||
                        t.assigned_to_details?.public_id === selectedDetailsEmployee.public_id) &&
                      (t.status || '').toLowerCase() !== 'done',
                  ).length
                }
                )
              </h4>
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {tasks
                  .filter(
                    (t) =>
                      t.assigned_to === selectedDetailsEmployee.public_id ||
                      t.assigned_to_details?.public_id === selectedDetailsEmployee.public_id,
                  )
                  .map((t) => (
                    <div key={t.public_id} className="p-2.5 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">{t.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {projectMap.get(t.project)?.name || 'Project'} · Due:{' '}
                          {formatDate(t.deadline)}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {t.status}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setSelectedDetailsEmployee(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setAssignModalEmployee(selectedDetailsEmployee);
                  setSelectedDetailsEmployee(null);
                }}
              >
                <Icon name="plus" size={13} /> Assign New Task
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
