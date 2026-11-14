import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { endpoints, unwrapList } from '../api/client';
import type {
  ApiListResponse,
  Asset,
  AssetAllocation,
  Branch,
  Company,
  Department,
  Employee,
  Expense,
  LeaveRequest,
  Project,
  Task,
} from '../api/types';
import { useAuth } from '../context/auth';
import { formatDate } from '../components/format';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  StatusBadge,
  type IconName,
} from '../components/ui';
import {
  calculateEmployeeAvailability,
} from '../utils/availability';

interface DashboardData {
  employees: Employee[] | null;
  projects: Project[] | null;
  assets: Asset[] | null;
  allocations: AssetAllocation[] | null;
  leaves: LeaveRequest[] | null;
  expenses: Expense[] | null;
  tasks: Task[] | null;
  companies: Company[] | null;
  branches: Branch[] | null;
  departments: Department[] | null;
}

const initialData: DashboardData = {
  employees: null,
  projects: null,
  assets: null,
  allocations: null,
  leaves: null,
  expenses: null,
  tasks: null,
  companies: null,
  branches: null,
  departments: null,
};

async function loadEndpoint<T>(url: string): Promise<T[]> {
  const { data } = await api.get<ApiListResponse<T>>(url);
  return unwrapList(data);
}

function StatTile({
  label,
  value,
  subtext,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card className="p-4 sm:p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{subtext}</p>
        </div>
        <span
          className={`flex size-10 items-center justify-center rounded-lg ${iconBg} ${iconColor} shrink-0 ring-1 ring-inset ring-black/5`}
        >
          <Icon name={icon} size={18} />
        </span>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);

  const isAdmin = Boolean(user?.is_superuser || user?.role_name === 'System Admin');
  const isHR = user?.role_name === 'HR Manager';
  const isPM = user?.role_name === 'Department / Project Manager';
  const isEmployee = user?.role_name === 'Employee' || (!isAdmin && !isHR && !isPM);

  const [formattedDate] = useState(() =>
    new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date()),
  );

  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10));
  const [nextTwoWeeksIso] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    let active = true;

    // Load available endpoints with allSettled
    const requests = [
      loadEndpoint<Employee>(endpoints.employees),
      loadEndpoint<Project>(endpoints.projects),
      loadEndpoint<Asset>(endpoints.assets),
      loadEndpoint<AssetAllocation>(endpoints.allocations),
      loadEndpoint<LeaveRequest>(endpoints.leaveRequests),
      loadEndpoint<Expense>(endpoints.expenses),
      loadEndpoint<Task>(endpoints.tasks),
      loadEndpoint<Company>(endpoints.companies),
      loadEndpoint<Branch>(endpoints.branches),
      loadEndpoint<Department>(endpoints.departments),
    ] as const;

    Promise.allSettled(requests).then(
      ([empRes, projRes, assetRes, allocRes, leaveRes, expRes, taskRes, compRes, branchRes, deptRes]) => {
        if (!active) return;
        setData({
          employees: empRes.status === 'fulfilled' ? empRes.value : null,
          projects: projRes.status === 'fulfilled' ? projRes.value : null,
          assets: assetRes.status === 'fulfilled' ? assetRes.value : null,
          allocations: allocRes.status === 'fulfilled' ? allocRes.value : null,
          leaves: leaveRes.status === 'fulfilled' ? leaveRes.value : null,
          expenses: expRes.status === 'fulfilled' ? expRes.value : null,
          tasks: taskRes.status === 'fulfilled' ? taskRes.value : null,
          companies: compRes.status === 'fulfilled' ? compRes.value : null,
          branches: branchRes.status === 'fulfilled' ? branchRes.value : null,
          departments: deptRes.status === 'fulfilled' ? deptRes.value : null,
        });
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  // Compute metrics from real data
  const displayName = user?.first_name ? `${user.first_name}` : user?.username || 'Team Member';
  const roleName = user?.role_name || (user?.is_superuser ? 'System Admin' : 'Employee');

  const totalEmployees = data.employees?.length ?? 0;
  const activeEmployeesCount =
    data.employees?.filter((e) => (e.employment_status || '').toLowerCase() === 'active').length ?? 0;
  const totalCompanies = data.companies?.length ?? '—';
  const totalBranches = data.branches?.length ?? '—';
  const activeProjectsCount =
    data.projects?.filter((p) => (p.status || '').toLowerCase() === 'active').length ?? 0;

  // Filter managers from employee records
  const managers = (data.employees ?? []).filter((emp) => {
    const role = emp.user_details?.role;
    const roleNameStr = typeof role === 'object' && role !== null ? role.role_name : emp.role_name;
    const title = (emp.job_title || '').toLowerCase();
    return (
      roleNameStr === 'Department / Project Manager' ||
      roleNameStr === 'HR Manager' ||
      title.includes('manager') ||
      title.includes('director') ||
      title.includes('lead')
    );
  });
  const managersCount = managers.length;

  // Asset metrics
  const totalAssetsCount = data.assets?.length ?? 0;
  const availableAssetsCount =
    data.assets?.filter((a) => (a.status || '').toLowerCase() === 'available').length ?? 0;
  const allocatedAssetsCount =
    data.allocations?.filter((a) => (a.status || '').toLowerCase() === 'allocated').length ?? 0;
  const maintenanceAssetsCount =
    data.assets?.filter((a) => (a.status || '').toLowerCase() === 'maintenance').length ?? 0;

  // Leave metrics
  const leavesList = useMemo(() => data.leaves ?? [], [data.leaves]);
  const pendingLeaves = useMemo(
    () => leavesList.filter((l) => (l.status || '').toLowerCase() === 'pending'),
    [leavesList],
  );
  const approvedLeaves = useMemo(
    () => leavesList.filter((l) => (l.status || '').toLowerCase() === 'approved'),
    [leavesList],
  );
  const rejectedLeaves = useMemo(
    () => leavesList.filter((l) => (l.status || '').toLowerCase() === 'rejected'),
    [leavesList],
  );
  const pendingLeavesCount = pendingLeaves.length;
  const approvedLeavesCount = approvedLeaves.length;
  const rejectedLeavesCount = rejectedLeaves.length;

  // On leave today
  const onLeaveToday = useMemo(
    () => approvedLeaves.filter((l) => l.start_date <= todayIso && l.end_date >= todayIso),
    [approvedLeaves, todayIso],
  );
  const onLeaveTodayCount = onLeaveToday.length;

  // Expense metrics
  const expensesList = useMemo(() => data.expenses ?? [], [data.expenses]);
  const pendingExpenses = useMemo(
    () => expensesList.filter((e) => (e.status || '').toLowerCase() === 'pending'),
    [expensesList],
  );
  const approvedExpenses = useMemo(
    () => expensesList.filter((e) => (e.status || '').toLowerCase() === 'approved'),
    [expensesList],
  );
  const pendingExpensesCount = pendingExpenses.length;
  const pendingExpensesAmount = useMemo(
    () => pendingExpenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
    [pendingExpenses],
  );
  const totalExpensesAmount = useMemo(
    () => expensesList.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
    [expensesList],
  );

  // Employee mapping
  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of data.employees ?? []) {
      map.set(emp.public_id, emp);
      map.set(`${emp.first_name} ${emp.last_name}`.toLowerCase(), emp);
    }
    return map;
  }, [data.employees]);

  // Asset mapping
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of data.assets ?? []) {
      map.set(a.public_id, a);
    }
    return map;
  }, [data.assets]);

  // Employee-specific metrics
  const myCompletedTasks =
    data.tasks?.filter((t) => (t.status || '').toLowerCase() === 'done').length ?? 0;
  const myPendingTasks =
    data.tasks?.filter((t) => (t.status || '').toLowerCase() !== 'done').length ?? 0;
  const myLeavesPending =
    data.leaves?.filter((l) => (l.status || '').toLowerCase() === 'pending').length ?? 0;
  const myExpensesTotal = (data.expenses ?? []).reduce(
    (acc, curr) => acc + (Number(curr.amount) || 0),
    0,
  );

  // PM specific metrics
  const pmProjects = data.projects ?? [];
  const pmTasks = data.tasks ?? [];
  const pmEmployees = data.employees ?? [];
  const pmLeaves = data.leaves ?? [];

  const pmActiveProjectsCount = pmProjects.filter(
    (p) => (p.status || '').toLowerCase() === 'active',
  ).length;
  const pmPlanningProjectsCount = pmProjects.filter(
    (p) => (p.status || '').toLowerCase() === 'planning',
  ).length;
  const pmCompletedProjectsCount = pmProjects.filter((p) => {
    const s = (p.status || '').toLowerCase();
    return s === 'completed' || s === 'done';
  }).length;

  const pmPendingTasksCount = pmTasks.filter(
    (t) => (t.status || '').toLowerCase() !== 'done',
  ).length;
  const pmCompletedTasksCount = pmTasks.filter(
    (t) => (t.status || '').toLowerCase() === 'done',
  ).length;
  const pmOverdueTasks = pmTasks.filter((t) => {
    const isDone = (t.status || '').toLowerCase() === 'done';
    return !isDone && t.deadline && t.deadline < todayIso;
  });
  const pmOverdueTasksCount = pmOverdueTasks.length;

  // Upcoming deadlines
  const upcomingProjectDeadlines = pmProjects
    .filter((p) => p.end_date && p.end_date >= todayIso)
    .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1))
    .slice(0, 4);

  const upcomingTaskDeadlines = pmTasks
    .filter((t) => {
      const isDone = (t.status || '').toLowerCase() === 'done';
      return !isDone && t.deadline && t.deadline >= todayIso;
    })
    .sort((a, b) => (a.deadline! > b.deadline! ? 1 : -1))
    .slice(0, 5);

  // PM Team availability summary
  const pmCurrentEmp = pmEmployees.find(
    (e) =>
      e.public_id === user?.employee_public_id ||
      e.user_details?.username === user?.username ||
      e.email === user?.email,
  );

  const pmAvailabilityList = pmEmployees.map((emp) => ({
    employee: emp,
    availability: calculateEmployeeAvailability(
      emp,
      pmTasks,
      pmLeaves,
      pmCurrentEmp?.public_id,
      todayIso,
      nextTwoWeeksIso,
    ),
  }));

  const pmAvailableCount = pmAvailabilityList.filter(
    (a) => a.availability.status === 'Available',
  ).length;
  const pmBusyCount = pmAvailabilityList.filter(
    (a) => a.availability.status === 'Busy',
  ).length;
  const pmOnLeaveCount = pmAvailabilityList.filter(
    (a) => a.availability.status === 'On Leave',
  ).length;

  const recentTasks = (data.tasks ?? []).slice(0, 6);

  if (loading) {
    return <LoadingState label="Loading workspace overview and metrics…" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formattedDate}
        title={`Welcome, ${displayName}`}
        description={
          isAdmin
            ? 'Administrator Control Workspace. Review organizational hierarchy, managers, branch facilities, and system metrics.'
            : isHR
              ? 'HR Operations Command Center. Manage company workforce, review time-off applications, audit employee expenses, and monitor equipment custody.'
              : isPM
                ? 'Project Manager Command Center. Direct active initiatives, track task pipelines, manage upcoming milestones, and verify team availability.'
                : `Logged into Northstar ERP as ${roleName}. Accessing verified enterprise records.`
        }
        action={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/admin/managers">
                <Button size="sm" variant="primary">
                  <Icon name="plus" size={14} /> Add Manager
                </Button>
              </Link>
              <Link to="/admin/branches">
                <Button size="sm" variant="secondary">
                  <Icon name="plus" size={14} /> Add Branch
                </Button>
              </Link>
            </div>
          ) : isHR ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/leave">
                <Button size="sm" variant="primary">
                  <Icon name="calendar" size={14} /> Review Leaves ({pendingLeavesCount})
                </Button>
              </Link>
              <Link to="/assets">
                <Button size="sm" variant="secondary">
                  <Icon name="cube" size={14} /> Hardware Inventory
                </Button>
              </Link>
              <Link to="/expenses">
                <Button size="sm" variant="secondary">
                  <Icon name="receipt" size={14} /> Audit Expenses
                </Button>
              </Link>
            </div>
          ) : isPM ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/pm/projects">
                <Button size="sm" variant="primary">
                  <Icon name="plus" size={14} /> New Project
                </Button>
              </Link>
              <Link to="/pm/tasks">
                <Button size="sm" variant="secondary">
                  <Icon name="plus" size={14} /> Schedule Task
                </Button>
              </Link>
              <Link to="/pm/availability">
                <Button size="sm" variant="secondary">
                  <Icon name="users" size={14} /> Availability Matrix
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      {/* Role-Specific Metric Decks */}
      {isAdmin && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile
            label="Total Managers"
            value={managersCount}
            subtext="Appointed project & HR leads"
            icon="users"
            iconBg="bg-blue-50"
            iconColor="text-blue-700"
          />
          <StatTile
            label="Organizations"
            value={totalCompanies}
            subtext="Registered corporate entities"
            icon="building"
            iconBg="bg-indigo-50"
            iconColor="text-indigo-700"
          />
          <StatTile
            label="Branch Offices"
            value={totalBranches}
            subtext="Operational facility locations"
            icon="briefcase"
            iconBg="bg-cyan-50"
            iconColor="text-cyan-700"
          />
          <StatTile
            label="Total Personnel"
            value={totalEmployees}
            subtext={`${activeEmployeesCount} active employees`}
            icon="user"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
          <StatTile
            label="Active Initiatives"
            value={activeProjectsCount}
            subtext={`${data.projects?.length ?? 0} total projects`}
            icon="check-circle"
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
          />
        </div>
      )}

      {isHR && !isAdmin && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile
            label="Total Workforce"
            value={totalEmployees}
            subtext={`${activeEmployeesCount} active staff members`}
            icon="users"
            iconBg="bg-blue-50"
            iconColor="text-blue-700"
          />
          <StatTile
            label="Hardware & Assets"
            value={totalAssetsCount}
            subtext={`${allocatedAssetsCount} allocated • ${availableAssetsCount} available`}
            icon="cube"
            iconBg="bg-cyan-50"
            iconColor="text-cyan-700"
          />
          <StatTile
            label="Leave Approvals"
            value={pendingLeavesCount}
            subtext={`${approvedLeavesCount} approved • ${rejectedLeavesCount} rejected`}
            icon="calendar"
            iconBg={pendingLeavesCount > 0 ? 'bg-amber-50' : 'bg-slate-100'}
            iconColor={pendingLeavesCount > 0 ? 'text-amber-700' : 'text-slate-600'}
          />
          <StatTile
            label="Expense Claims"
            value={pendingExpensesCount}
            subtext={`$${pendingExpensesAmount.toFixed(2)} awaiting audit`}
            icon="receipt"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
          <StatTile
            label="Attendance Telemetry"
            value={`${onLeaveTodayCount} on Leave`}
            subtext={`Backend API pending • ${activeEmployeesCount} scheduled`}
            icon="clock"
            iconBg="bg-indigo-50"
            iconColor="text-indigo-700"
          />
        </div>
      )}

      {isPM && !isAdmin && !isHR && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile
            label="Total Projects"
            value={pmProjects.length}
            subtext={`${pmActiveProjectsCount} active • ${pmCompletedProjectsCount} completed • ${pmPlanningProjectsCount} planning`}
            icon="briefcase"
            iconBg="bg-indigo-50"
            iconColor="text-indigo-700"
          />
          <StatTile
            label="Assigned Tasks"
            value={pmTasks.length}
            subtext={`${pmPendingTasksCount} pending • ${pmCompletedTasksCount} completed`}
            icon="check-circle"
            iconBg="bg-blue-50"
            iconColor="text-blue-700"
          />
          <StatTile
            label="Overdue Tasks"
            value={pmOverdueTasksCount}
            subtext={pmOverdueTasksCount > 0 ? 'Requires immediate action' : 'All milestones on schedule'}
            icon="clock"
            iconBg={pmOverdueTasksCount > 0 ? 'bg-rose-50' : 'bg-emerald-50'}
            iconColor={pmOverdueTasksCount > 0 ? 'text-rose-700' : 'text-emerald-700'}
          />
          <StatTile
            label="Available Team"
            value={pmAvailableCount}
            subtext="Ready for new task assignment"
            icon="users"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
          <StatTile
            label="Busy / On Leave"
            value={pmBusyCount + pmOnLeaveCount}
            subtext={`${pmBusyCount} busy • ${pmOnLeaveCount} on approved leave`}
            icon="calendar"
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
          />
        </div>
      )}

      {isEmployee && (
        <Card className="p-4 sm:p-5 border-blue-100 bg-gradient-to-r from-blue-50/50 via-white to-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-base font-bold text-white shadow-xs">
                {user?.first_name ? `${user.first_name[0]}${user.last_name?.[0] || ''}` : 'E'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
                  </h2>
                  <StatusBadge status={user?.employment_status || 'Active'} />
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {user?.job_title || 'Enterprise Employee'} · {user?.department_name || 'Organization'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t sm:border-t-0 sm:border-l border-slate-200/80 pt-3 sm:pt-0 sm:pl-5 text-xs">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Username</p>
                <p className="font-mono text-slate-800">@{user?.username}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Official Email</p>
                <p className="text-slate-800 truncate">{user?.email || '—'}</p>
              </div>
              {user?.hire_date && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Joining Date</p>
                  <p className="text-slate-800">{formatDate(user.hire_date)}</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {isEmployee && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="My Active Tasks"
            value={myPendingTasks}
            subtext={`${myCompletedTasks} tasks completed`}
            icon="briefcase"
            iconBg="bg-blue-50"
            iconColor="text-blue-700"
          />
          <StatTile
            label="Leave Applications"
            value={myLeavesPending}
            subtext="Requests in review"
            icon="calendar"
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
          />
          <StatTile
            label="My Expenses"
            value={`$${myExpensesTotal.toFixed(2)}`}
            subtext={`${data.expenses?.length ?? 0} submitted claims`}
            icon="receipt"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
          <StatTile
            label="Allocated Equipment"
            value={allocatedAssetsCount}
            subtext="Company hardware in your care"
            icon="cube"
            iconBg="bg-cyan-50"
            iconColor="text-cyan-700"
          />
        </div>
      )}

      {/* Main Grid: Data Section & Quick Access */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left Section (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {isAdmin ? (
            <>
              {/* Admin View: Appointed Managers Table */}
              <Card>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Appointed Managers Roster
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Department leaders and HR managers across the organization
                    </p>
                  </div>
                  <Link
                    to="/admin/managers"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Manage all ({managers.length}) <Icon name="arrow" size={14} />
                  </Link>
                </div>

                {managers.length > 0 ? (
                  <div className="divide-y divide-slate-100 overflow-x-auto">
                    {managers.slice(0, 6).map((m) => {
                      const role = m.user_details?.role;
                      const roleNameStr =
                        typeof role === 'object' && role !== null ? role.role_name : m.role_name;

                      return (
                        <div
                          key={m.public_id}
                          className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/70 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {m.first_name} {m.last_name}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span>{m.job_title || 'Manager'}</span>
                              <span className="text-slate-300">·</span>
                              <span className="text-blue-600 font-medium">
                                {m.department_name || 'Global'}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>@{m.user_details?.username || 'user'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              {roleNameStr || 'Manager'}
                            </span>
                            <StatusBadge status={m.employment_status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon="users"
                    title="No managers currently registered"
                    description="Add your first manager account to delegate department leadership and project delivery."
                    action={
                      <Link to="/admin/managers">
                        <Button size="sm">
                          <Icon name="plus" size={14} /> Add Manager
                        </Button>
                      </Link>
                    }
                  />
                )}
              </Card>

              {/* Organization Monitoring Snapshot for Admin */}
              <Card>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Organization Monitoring & Oversight
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Cross-departmental monitoring of assets, leave approvals, attendance, and expense claims
                    </p>
                  </div>
                </div>

                <div className="p-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Icon name="calendar" size={14} className="text-amber-600" /> Leave Approvals
                      </span>
                      <Link
                        to="/leave"
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5"
                      >
                        Inspect <Icon name="arrow" size={12} />
                      </Link>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{leavesList.length}</p>
                    <p className="text-[11px] text-slate-500">
                      {pendingLeavesCount} pending • {approvedLeavesCount} approved • {rejectedLeavesCount} rejected
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Icon name="receipt" size={14} className="text-emerald-600" /> Expense Claims
                      </span>
                      <Link
                        to="/expenses"
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5"
                      >
                        Inspect <Icon name="arrow" size={12} />
                      </Link>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">${totalExpensesAmount.toFixed(2)}</p>
                    <p className="text-[11px] text-slate-500">
                      {pendingExpensesCount} claims awaiting audit • {approvedExpenses.length} processed
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Icon name="cube" size={14} className="text-cyan-600" /> Asset Inventory
                      </span>
                      <Link
                        to="/assets"
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5"
                      >
                        Inspect <Icon name="arrow" size={12} />
                      </Link>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{totalAssetsCount}</p>
                    <p className="text-[11px] text-slate-500">
                      {allocatedAssetsCount} assigned to staff • {availableAssetsCount} available • {maintenanceAssetsCount} in repair
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Icon name="clock" size={14} className="text-indigo-600" /> Attendance Telemetry
                      </span>
                      <Link
                        to="/attendance"
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5"
                      >
                        Inspect <Icon name="arrow" size={12} />
                      </Link>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{activeEmployeesCount} Staff</p>
                    <p className="text-[11px] text-slate-500">
                      {onLeaveTodayCount} on approved leave today • Clock-in API pending
                    </p>
                  </div>
                </div>
              </Card>
            </>
          ) : isHR ? (
            <>
              {/* HR View: Pending Leave Approvals Queue */}
              <Card>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <span>Pending Leave Applications</span>
                      {pendingLeavesCount > 0 && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          {pendingLeavesCount} Action Required
                        </span>
                      )}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Employee time-off requests awaiting authorized HR review and decision
                    </p>
                  </div>
                  <Link
                    to="/leave"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Open Leave Center <Icon name="arrow" size={14} />
                  </Link>
                </div>

                {pendingLeaves.length > 0 ? (
                  <div className="divide-y divide-slate-100 overflow-x-auto">
                    {pendingLeaves.slice(0, 5).map((l) => {
                      const emp = employeeMap.get((l.employee_name || '').toLowerCase());

                      return (
                        <div
                          key={l.public_id}
                          className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/70 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900 text-xs">{l.employee_name}</p>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 font-medium">
                                {l.leave_type_name}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span>{emp?.department_name || 'Staff'}</span>
                              <span className="text-slate-300">·</span>
                              <span className="font-mono text-slate-700">
                                {formatDate(l.start_date)} – {formatDate(l.end_date)} ({l.duration ?? 1}d)
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-600 truncate max-w-md italic">
                              "{l.reason}"
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <StatusBadge status={l.status} />
                            <Link to="/leave">
                              <Button size="sm" variant="secondary" className="text-xs px-2.5 py-1">
                                Review
                              </Button>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon="calendar"
                    title="All leave requests are up to date"
                    description="No employee leave applications are currently pending HR review."
                  />
                )}
              </Card>

              {/* HR View: Recent Expense Submissions */}
              <Card>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Recent Expense Reimbursement Claims
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Expense filings submitted across personnel with attachment status
                    </p>
                  </div>
                  <Link
                    to="/expenses"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    View All Claims ({expensesList.length}) <Icon name="arrow" size={14} />
                  </Link>
                </div>

                {expensesList.length > 0 ? (
                  <div className="divide-y divide-slate-100 overflow-x-auto">
                    {expensesList.slice(0, 5).map((exp) => (
                      <div
                        key={exp.public_id}
                        className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/70 transition"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-xs">
                            {exp.employee_name || 'Staff Member'}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="font-medium text-slate-700">{exp.category_name || exp.category}</span>
                            <span className="text-slate-300">·</span>
                            <span className="truncate max-w-xs">{exp.description}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            ${Number(exp.amount).toFixed(2)}
                          </span>
                          <StatusBadge status={exp.status} />
                          <Link to="/expenses">
                            <Button size="sm" variant="secondary" className="text-xs px-2 py-1">
                              Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="receipt"
                    title="No expense claims submitted"
                    description="Employee claims will appear here once submitted for reimbursement."
                  />
                )}
              </Card>

              {/* HR View: Active Hardware Allocations */}
              <Card>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Company Equipment & Active Custody
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Hardware devices and equipment currently allocated to enterprise staff
                    </p>
                  </div>
                  <Link
                    to="/assets"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Manage Inventory ({totalAssetsCount}) <Icon name="arrow" size={14} />
                  </Link>
                </div>

                {(data.allocations ?? []).length > 0 ? (
                  <div className="divide-y divide-slate-100 overflow-x-auto">
                    {(data.allocations ?? []).slice(0, 5).map((alloc) => {
                      const a = assetMap.get(alloc.asset);
                      const emp = employeeMap.get(alloc.employee);

                      return (
                        <div
                          key={alloc.public_id}
                          className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/70 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 text-xs">
                              {a ? a.asset_name : alloc.asset}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Custody: {emp ? `${emp.first_name} ${emp.last_name}` : alloc.employee} • Assigned {formatDate(alloc.allocation_date)}
                            </p>
                          </div>
                          <StatusBadge status={alloc.status} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon="cube"
                    title="No equipment allocated"
                    description="Assign available inventory equipment to employees in the Asset module."
                  />
                )}
              </Card>
            </>
          ) : isPM ? (
            <>
              {/* Upcoming Project & Task Deadlines */}
              <Card>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Upcoming Deadlines & Milestones
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Target dates for active initiatives and deliverable tasks
                    </p>
                  </div>
                  <Link
                    to="/pm/calendar"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    View Schedule <Icon name="arrow" size={14} />
                  </Link>
                </div>

                <div className="p-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Icon name="briefcase" size={13} className="text-indigo-600" />
                      Project Milestones ({upcomingProjectDeadlines.length})
                    </span>

                    {upcomingProjectDeadlines.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">
                        No upcoming project deadlines.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {upcomingProjectDeadlines.map((proj) => (
                          <div
                            key={proj.public_id}
                            className="p-2 rounded-lg bg-white border border-slate-200 text-xs flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 truncate">{proj.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                End: {formatDate(proj.end_date)}
                              </p>
                            </div>
                            <StatusBadge status={proj.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Icon name="check-circle" size={13} className="text-blue-600" />
                      Task Deadlines ({upcomingTaskDeadlines.length})
                    </span>

                    {upcomingTaskDeadlines.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">
                        No upcoming task deadlines.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {upcomingTaskDeadlines.map((t) => (
                          <div
                            key={t.public_id}
                            className="p-2 rounded-lg bg-white border border-slate-200 text-xs flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 truncate">{t.title}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                Due: {formatDate(t.deadline)}
                              </p>
                            </div>
                            <StatusBadge status={t.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* PM Team Availability Snapshot */}
              <Card>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Team Availability Snapshot
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Real-time availability and verified leave schedules across personnel
                    </p>
                  </div>
                  <Link
                    to="/pm/availability"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Full Matrix ({pmEmployees.length}) <Icon name="arrow" size={14} />
                  </Link>
                </div>

                <div className="divide-y divide-slate-100 overflow-x-auto">
                  {pmAvailabilityList.slice(0, 5).map(({ employee, availability }) => (
                    <div
                      key={employee.public_id}
                      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/70 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-xs">
                          {employee.first_name} {employee.last_name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {employee.job_title || 'Staff'} · {employee.department_name || 'Department'}
                        </p>
                      </div>

                      <div className="text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            availability.status === 'Available'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : availability.status === 'Busy'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : availability.status === 'On Leave'
                                  ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              availability.status === 'Available'
                                ? 'bg-emerald-500'
                                : availability.status === 'Busy'
                                  ? 'bg-amber-500'
                                  : availability.status === 'On Leave'
                                    ? 'bg-purple-500'
                                    : 'bg-slate-400'
                            }`}
                          />
                          {availability.statusLabel}
                        </span>
                        <p className="text-[9px] text-slate-400 mt-0.5 font-mono">
                          {availability.upcomingAvailableDate === 'Immediate'
                            ? 'Immediate'
                            : `Free: ${formatDate(availability.upcomingAvailableDate)}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            /* Employee View: Tasks Pipeline */
            <Card>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    My Assigned Tasks
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Work items assigned to your account
                  </p>
                </div>
                <Link
                  to="/projects"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  View all tasks <Icon name="arrow" size={14} />
                </Link>
              </div>

              {recentTasks.length > 0 ? (
                <div className="divide-y divide-slate-100 overflow-x-auto">
                  {recentTasks.map((task) => (
                    <div
                      key={task.public_id}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/70 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {task.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span>
                            {task.assigned_to_details
                              ? `${task.assigned_to_details.first_name} ${task.assigned_to_details.last_name}`
                              : 'Unassigned'}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>Due: {formatDate(task.deadline)}</span>
                        </div>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="briefcase"
                  title="No active tasks in pipeline"
                  description="When tasks are scheduled or assigned, they will display here with delivery statuses."
                />
              )}
            </Card>
          )}
        </div>

        {/* Right Section: Quick Access & Role Panels (1 col) */}
        <div className="space-y-4">
          {/* Workspaces Navigation */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {isAdmin
                ? 'Administrative Workspaces'
                : isHR
                  ? 'HR Operations Console'
                  : isPM
                    ? 'Project Workspaces'
                    : 'Workspace Access'}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {isAdmin
                ? 'Authorized management consoles.'
                : isHR
                  ? 'Personnel operations, assets, and approvals.'
                  : isPM
                    ? 'Authorized project leadership consoles.'
                    : 'Direct access to modules permitted for your role.'}
            </p>

            <div className="mt-4 space-y-2">
              {isAdmin ? (
                <>
                  <Link
                    to="/admin/managers"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                        <Icon name="users" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Manager Management</p>
                        <p className="text-[10px] text-slate-500">Provision & assign managers</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/admin/organizations"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                        <Icon name="building" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Organization Management</p>
                        <p className="text-[10px] text-slate-500">Corporate entities & register</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/admin/branches"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600">
                        <Icon name="briefcase" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Branch Management</p>
                        <p className="text-[10px] text-slate-500">Office facilities & locations</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/admin/employees"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                        <Icon name="user" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Employee Directory (Read Only)</p>
                        <p className="text-[10px] text-slate-500">View workforce personnel</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>
                </>
              ) : isHR ? (
                <>
                  <Link
                    to="/organization"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                        <Icon name="users" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Employee Management</p>
                        <p className="text-[10px] text-slate-500">Personnel onboarding & directory</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/leave"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                        <Icon name="calendar" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Leave Management</p>
                        <p className="text-[10px] text-slate-500">Approvals & time-off calendar</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/assets"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600">
                        <Icon name="cube" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Asset Management</p>
                        <p className="text-[10px] text-slate-500">Hardware inventory & allocations</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/attendance"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                        <Icon name="clock" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Attendance Management</p>
                        <p className="text-[10px] text-slate-500">Daily staffing & schedule sync</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/expenses"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                        <Icon name="receipt" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Expense Management</p>
                        <p className="text-[10px] text-slate-500">Claim audit & justifications</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>
                </>
              ) : isPM ? (
                <>
                  <Link
                    to="/pm/projects"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                        <Icon name="briefcase" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">My Projects</p>
                        <p className="text-[10px] text-slate-500">Initiatives & progress tracking</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/pm/team"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                        <Icon name="users" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Project Team</p>
                        <p className="text-[10px] text-slate-500">Member workload & staffing</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/pm/tasks"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                        <Icon name="check-circle" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Task Management</p>
                        <p className="text-[10px] text-slate-500">Deliverables, status & schedule</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/pm/availability"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600">
                        <Icon name="calendar" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Employee Availability</p>
                        <p className="text-[10px] text-slate-500">Real-time workload & leave matrix</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/projects"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                        <Icon name="briefcase" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Projects & Tasks</p>
                        <p className="text-[10px] text-slate-500">Initiatives and team tasks</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/assets"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600">
                        <Icon name="cube" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Hardware & Assets</p>
                        <p className="text-[10px] text-slate-500">Inventory and allocations</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/leave"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                        <Icon name="calendar" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Leave Management</p>
                        <p className="text-[10px] text-slate-500">Time-off requests & balances</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>

                  <Link
                    to="/expenses"
                    className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                        <Icon name="receipt" size={14} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Expenses & Claims</p>
                        <p className="text-[10px] text-slate-500">Reimbursement submissions</p>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                  </Link>
                </>
              )}
            </div>
          </Card>

          {/* Admin Organization Monitoring Links */}
          {isAdmin && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Organization Monitoring
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Direct read-only monitoring access across branches.
              </p>
              <div className="mt-3 space-y-2">
                <Link
                  to="/assets"
                  className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600">
                      <Icon name="cube" size={14} />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Asset Inventory & Allocations</p>
                      <p className="text-[10px] text-slate-500">{totalAssetsCount} units in register</p>
                    </div>
                  </div>
                  <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                </Link>

                <Link
                  to="/leave"
                  className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                      <Icon name="calendar" size={14} />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Leave Requests & Approvals</p>
                      <p className="text-[10px] text-slate-500">{pendingLeavesCount} pending approval</p>
                    </div>
                  </div>
                  <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                </Link>

                <Link
                  to="/attendance"
                  className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                      <Icon name="clock" size={14} />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Attendance Records</p>
                      <p className="text-[10px] text-slate-500">{activeEmployeesCount} active staff</p>
                    </div>
                  </div>
                  <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                </Link>

                <Link
                  to="/expenses"
                  className="group flex items-center justify-between rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                      <Icon name="receipt" size={14} />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Expense Claims & Audit</p>
                      <p className="text-[10px] text-slate-500">${totalExpensesAmount.toFixed(2)} total volume</p>
                    </div>
                  </div>
                  <Icon name="chevron" size={14} className="text-slate-400 group-hover:text-slate-600" />
                </Link>
              </div>
            </Card>
          )}

          {/* Attendance Telemetry Widget for HR */}
          {isHR && (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Icon name="clock" size={14} className="text-indigo-600" /> Attendance Telemetry
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  Daily Sync
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Workforce roster cross-referenced with approved leave records
              </p>

              <div className="mt-3 space-y-2.5 text-xs">
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-900">
                  <p className="font-semibold">Notice: Biometric API Unavailable</p>
                  <p className="mt-0.5 text-amber-800">
                    The backend attendance module (<code className="font-mono">/api/attendance/</code>) is not yet deployed. Showing verified staffing data.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200/80">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">On Duty Today</p>
                    <p className="mt-0.5 text-lg font-bold text-emerald-700">
                      {Math.max(0, activeEmployeesCount - onLeaveTodayCount)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200/80">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">On Leave Today</p>
                    <p className="mt-0.5 text-lg font-bold text-amber-700">
                      {onLeaveTodayCount}
                    </p>
                  </div>
                </div>

                <Link to="/attendance">
                  <Button variant="secondary" size="sm" className="w-full justify-center text-xs mt-1">
                    Open Attendance Console
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Department Distribution Snapshot for HR */}
          {isHR && (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Icon name="building" size={14} className="text-blue-600" /> Departments ({data.departments?.length ?? 0})
                </h2>
                <Link
                  to="/organization"
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  Directory <Icon name="arrow" size={12} />
                </Link>
              </div>

              <div className="mt-3 divide-y divide-slate-100 text-xs">
                {(data.departments ?? []).slice(0, 5).map((dept) => {
                  const deptEmps = (data.employees ?? []).filter(
                    (e) => e.department === dept.public_id || e.department_name === dept.name,
                  );

                  return (
                    <div key={dept.public_id} className="py-2 flex items-center justify-between">
                      <span className="font-medium text-slate-800">{dept.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {deptEmps.length} staff
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
