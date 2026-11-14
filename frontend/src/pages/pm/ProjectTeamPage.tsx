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
  SearchInput,
  SelectField,
  StatusBadge,
  SuccessMessage,
  TextareaField,
} from '../../components/ui';

export default function ProjectTeamPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Project selection filter
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'current' | 'roster'>('current');
  const [search, setSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');

  // Date period for availability evaluation (defaults to next 14 days)
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [defaultEndStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [periodStart, setPeriodStart] = useState(todayStr);
  const [periodEnd, setPeriodEnd] = useState(defaultEndStr);

  // Assign modal
  const [assignModalEmployee, setAssignModalEmployee] = useState<Employee | null>(null);
  const [assignProjectId, setAssignProjectId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [projRes, taskRes, empRes, leaveRes] = await Promise.all([
        client.projects(),
        client.tasks(),
        client.employees(),
        client.leaveRequests(),
      ]);
      setProjects(unwrapList(projRes.data));
      setTasks(unwrapList(taskRes.data));
      setEmployees(unwrapList(empRes.data));
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

  // Map project ID to project
  const projectMap = useMemo(() => {
    return new Map(projects.map((p) => [p.public_id, p]));
  }, [projects]);

  // Map employee ID to availability computation
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

  // Selected project object
  const activeProject = useMemo(() => {
    if (selectedProjectId === 'all') return null;
    return projectMap.get(selectedProjectId) || null;
  }, [selectedProjectId, projectMap]);

  // Set of team member public IDs for active project
  const activeProjectTeamMap = useMemo(() => {
    const map = new Map<string, { role: 'Manager' | 'Member'; employee: Employee }>();
    if (!activeProject) {
      // If 'all', all employees who are manager or have tasks
      for (const p of projects) {
        if (p.manager_details) {
          map.set(p.manager_details.public_id, {
            role: 'Manager',
            employee: p.manager_details,
          });
        }
      }
      for (const t of tasks) {
        if (t.assigned_to_details) {
          if (!map.has(t.assigned_to_details.public_id)) {
            map.set(t.assigned_to_details.public_id, {
              role: 'Member',
              employee: t.assigned_to_details,
            });
          }
        }
      }
      return map;
    }

    // Single active project
    if (activeProject.manager_details) {
      map.set(activeProject.manager_details.public_id, {
        role: 'Manager',
        employee: activeProject.manager_details,
      });
    }

    const projTasks = tasks.filter((t) => t.project === activeProject.public_id);
    for (const t of projTasks) {
      if (t.assigned_to_details) {
        if (!map.has(t.assigned_to_details.public_id)) {
          map.set(t.assigned_to_details.public_id, {
            role: 'Member',
            employee: t.assigned_to_details,
          });
        }
      }
    }
    return map;
  }, [activeProject, projects, tasks]);

  // Filtered current team members
  const currentTeamList = useMemo(() => {
    const list = Array.from(activeProjectTeamMap.values());
    return list.filter(({ employee }) => {
      const avail = availabilityMap.get(employee.public_id);
      if (availabilityFilter && avail?.status.toLowerCase() !== availabilityFilter.toLowerCase()) {
        return false;
      }
      if (search) {
        const query = search.toLowerCase();
        const name = `${employee.first_name} ${employee.last_name}`.toLowerCase();
        const dept = (employee.department_name || '').toLowerCase();
        const title = (employee.job_title || '').toLowerCase();
        if (!name.includes(query) && !dept.includes(query) && !title.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [activeProjectTeamMap, availabilityMap, availabilityFilter, search]);

  // Candidate roster of employees to assign
  const candidateRoster = useMemo(() => {
    return employees.filter((emp) => {
      const avail = availabilityMap.get(emp.public_id);
      if (availabilityFilter && avail?.status.toLowerCase() !== availabilityFilter.toLowerCase()) {
        return false;
      }
      if (search) {
        const query = search.toLowerCase();
        const name = `${emp.first_name} ${emp.last_name}`.toLowerCase();
        const dept = (emp.department_name || '').toLowerCase();
        const title = (emp.job_title || '').toLowerCase();
        if (!name.includes(query) && !dept.includes(query) && !title.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [employees, availabilityMap, availabilityFilter, search]);

  // Handle assigning an employee to a project (by creating a scheduled task in that project)
  const handleAssignTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!assignModalEmployee || !assignProjectId) return;
    setSaving(true);
    setFormError('');
    setError('');

    const form = new FormData(e.currentTarget);
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    const deadline = String(form.get('deadline') || '').trim() || null;
    const status = String(form.get('status') || 'To Do').trim();

    if (!title) {
      setFormError('Task title is required to assign employee.');
      setSaving(false);
      return;
    }

    const targetProject = projectMap.get(assignProjectId);
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
        project: assignProjectId,
        assigned_to: assignModalEmployee.public_id,
        title,
        description: description || null,
        deadline,
        status,
      });

      setTasks((prev) => [createdTask, ...prev]);
      setSuccess(
        `${assignModalEmployee.first_name} ${assignModalEmployee.last_name} assigned to "${
          targetProject?.name || 'Project'
        }" with task "${title}".`,
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
        eyebrow="Personnel & Staffing"
        title="Project Team"
        description="Monitor assigned team members across project initiatives, review real workload balances, and assign available talent."
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setActiveTab('roster');
              }}
            >
              <Icon name="users" size={14} /> Assign New Member
            </Button>
          </div>
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* Project Selector & Overview Bar */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Focus Project:
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="min-h-9.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Managed Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.public_id} value={p.public_id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </div>

          {activeProject ? (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="font-semibold text-slate-800">Timeline:</span>
                <span className="font-mono text-[11px]">
                  {formatDate(activeProject.start_date)} → {formatDate(activeProject.end_date)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="font-semibold text-slate-800">Lead:</span>
                <span>
                  {activeProject.manager_details
                    ? `${activeProject.manager_details.first_name} ${activeProject.manager_details.last_name}`
                    : 'Unassigned'}
                </span>
              </div>
              <StatusBadge status={activeProject.status} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Showing aggregated team members across all current initiatives.
            </p>
          )}
        </div>
      </Card>

      {/* Main Container */}
      <Card className="overflow-hidden">
        {/* Navigation Tabs and Filters */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
            <button
              type="button"
              onClick={() => setActiveTab('current')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'current'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name="users" size={14} />
              <span>
                {activeProject ? `${activeProject.name} Team` : 'Project Team Members'} (
                {activeProjectTeamMap.size})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('roster')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'roster'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name="plus" size={14} />
              <span>Available Talent Pool ({employees.length})</span>
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search team member…"
              className="w-full sm:w-56"
            />

            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              aria-label="Filter availability"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Availability</option>
              <option value="Available">Available</option>
              <option value="Busy">Busy</option>
              <option value="On Leave">On Leave</option>
              <option value="Unknown">Unknown / Unverified</option>
            </select>
          </div>
        </div>

        {/* Date Range Evaluation Bar */}
        <div className="bg-slate-50/70 border-b border-slate-100 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Icon name="calendar" size={14} className="text-slate-400" />
            <span className="font-semibold text-slate-700">Availability Evaluation Window:</span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-mono"
            />
            <span>to</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-mono"
            />
          </div>
          <span className="text-[11px] text-slate-400">
            Workload & leaves computed in real-time from active tasks and verified leave records.
          </span>
        </div>

        {loading ? (
          <LoadingState label="Loading project team and workload data…" />
        ) : activeTab === 'current' ? (
          /* Current Project Team Tab */
          currentTeamList.length === 0 ? (
            <EmptyState
              icon="users"
              title="No team members assigned"
              description={
                activeProject
                  ? `"${activeProject.name}" does not have any assigned team tasks yet. Add team members to staff this initiative.`
                  : 'No team members match the search filters.'
              }
              action={
                <Button size="sm" onClick={() => setActiveTab('roster')}>
                  <Icon name="plus" size={14} /> Assign Talent from Pool
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {currentTeamList.map(({ role, employee }) => {
                const avail = availabilityMap.get(employee.public_id);
                const employeeTasks = tasks.filter(
                  (t) =>
                    t.assigned_to === employee.public_id ||
                    t.assigned_to_details?.public_id === employee.public_id,
                );
                const activeTasksInProject = employeeTasks.filter(
                  (t) =>
                    (t.status || '').toLowerCase() !== 'done' &&
                    (activeProject ? t.project === activeProject.public_id : true),
                );
                const totalActiveTasks = employeeTasks.filter(
                  (t) => (t.status || '').toLowerCase() !== 'done',
                );

                return (
                  <div
                    key={employee.public_id}
                    className="flex flex-col gap-4 p-5 hover:bg-slate-50/70 transition sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white shadow-xs">
                        {initials(`${employee.first_name} ${employee.last_name}`)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 truncate text-sm">
                            {employee.first_name} {employee.last_name}
                          </p>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              role === 'Manager'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {employee.job_title || 'Engineer'} ·{' '}
                          <span className="text-blue-600 font-medium">
                            {employee.department_name || 'Department'}
                          </span>
                          {employee.email && ` · ${employee.email}`}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Reason / Availability note: {avail?.reason}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                      {/* Workload Pill */}
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-left">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">
                          Current Tasks
                        </p>
                        <p className="font-bold text-slate-800">
                          {activeTasksInProject.length} in project{' '}
                          <span className="text-slate-400 font-normal">
                            ({totalActiveTasks.length} overall)
                          </span>
                        </p>
                      </div>

                      {/* Availability Status Badge */}
                      <div className="text-right">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">
                          Status
                        </p>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
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
                      </div>

                      {/* Action */}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setFormError('');
                          setAssignModalEmployee(employee);
                          setAssignProjectId(
                            activeProject ? activeProject.public_id : projects[0]?.public_id || '',
                          );
                        }}
                      >
                        <Icon name="plus" size={13} /> Assign Task
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Available Talent Pool Tab */
          <div className="divide-y divide-slate-100">
            {candidateRoster.map((emp) => {
              const avail = availabilityMap.get(emp.public_id);
              const isOnActiveTeam = activeProjectTeamMap.has(emp.public_id);
              const totalActiveTasks = tasks.filter(
                (t) =>
                  (t.assigned_to === emp.public_id ||
                    t.assigned_to_details?.public_id === emp.public_id) &&
                  (t.status || '').toLowerCase() !== 'done',
              );

              return (
                <div
                  key={emp.public_id}
                  className="flex flex-col gap-4 p-5 hover:bg-slate-50/70 transition sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-xs font-bold text-white shadow-xs">
                      {initials(`${emp.first_name} ${emp.last_name}`)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 truncate text-sm">
                          {emp.first_name} {emp.last_name}
                        </p>
                        {isOnActiveTeam && (
                          <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase">
                            Currently on Team
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {emp.job_title || 'Specialist'} ·{' '}
                        <span className="text-blue-600 font-medium">
                          {emp.department_name || 'Department'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Upcoming Availability: {avail?.upcomingAvailableDate || 'Immediate'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-left">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">
                        Current Workload
                      </p>
                      <p className="font-bold text-slate-800">
                        {totalActiveTasks.length} active tasks
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
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

                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setFormError('');
                        setAssignModalEmployee(emp);
                        setAssignProjectId(
                          activeProject ? activeProject.public_id : projects[0]?.public_id || '',
                        );
                      }}
                    >
                      <Icon name="plus" size={13} /> Assign to Project
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal: Assign Employee / Schedule Task in Project */}
      {assignModalEmployee && (
        <Modal
          title={`Assign ${assignModalEmployee.first_name} ${assignModalEmployee.last_name}`}
          description="Schedule a project deliverable task to assign this team member to the initiative."
          onClose={() => setAssignModalEmployee(null)}
        >
          <form className="space-y-4" onSubmit={handleAssignTask}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            {/* Availability Warning Banner */}
            {availabilityMap.get(assignModalEmployee.public_id)?.status === 'On Leave' && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-xs text-purple-800 flex items-start gap-2">
                <Icon name="alert" size={16} className="text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Team Member is Currently On Leave</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed">
                    {availabilityMap.get(assignModalEmployee.public_id)?.reason}
                  </p>
                </div>
              </div>
            )}

            {availabilityMap.get(assignModalEmployee.public_id)?.status === 'Busy' && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                <Icon name="alert" size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">High Workload Warning</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed">
                    This team member currently has active tasks or conflicting deadlines during the
                    selected period. Confirm assignment suitability.
                  </p>
                </div>
              </div>
            )}

            <SelectField
              label="Initiative Project"
              name="project"
              required
              value={assignProjectId}
              onChange={(e) => setAssignProjectId(e.target.value)}
            >
              <option value="" disabled>
                Select target project…
              </option>
              {projects.map((p) => (
                <option key={p.public_id} value={p.public_id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </SelectField>

            <Field
              label="Deliverable Task Title"
              name="title"
              required
              placeholder="e.g. Lead database migration sprint"
            />

            <TextareaField
              label="Deliverable Scope & Brief"
              name="description"
              placeholder="Outline specific objectives and expectations…"
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
              <Button disabled={saving || !assignProjectId}>
                {saving ? 'Assigning…' : 'Confirm Assignment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
