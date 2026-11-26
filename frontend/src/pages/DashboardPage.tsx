import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { endpoints, unwrapList } from '../api/client';
import type {
  ApiListResponse,
  AssetAllocation,
  Expense,
  LeaveRequest,
  Project,
  Task,
} from '../api/types';
import { useAuth } from '../context/auth';
import { formatDate } from '../components/format';
import {
  Card,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '../components/ui';

interface DashboardData {
  employees: number | null;
  projects: Project[] | null;
  allocations: AssetAllocation[] | null;
  leaves: LeaveRequest[] | null;
  expenses: Expense[] | null;
  tasks: Task[] | null;
}

const initial: DashboardData = {
  employees: null,
  projects: null,
  allocations: null,
  leaves: null,
  expenses: null,
  tasks: null,
};

async function loadList<T>(url: string): Promise<T[]> {
  const { data } = await api.get<ApiListResponse<T>>(url);
  return unwrapList(data);
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: 'users' | 'briefcase' | 'cube' | 'calendar' | 'receipt';
  color: string;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">{detail}</p>
        </div>
        <span className={`flex size-11 items-center justify-center rounded-xl ${color}`}><Icon name={icon} size={19} /></span>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [dateLabel] = useState(() => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()));

  useEffect(() => {
    let active = true;
    const requests = [
      loadList(endpoints.employees),
      loadList<Project>(endpoints.projects),
      loadList<AssetAllocation>(endpoints.allocations),
      loadList<LeaveRequest>(endpoints.leaveRequests),
      loadList<Expense>(endpoints.expenses),
      loadList<Task>(endpoints.tasks),
    ] as const;
    Promise.allSettled(requests).then((results) => {
      if (!active) return;
      setData({
        employees: results[0].status === 'fulfilled' ? results[0].value.length : null,
        projects: results[1].status === 'fulfilled' ? results[1].value : null,
        allocations: results[2].status === 'fulfilled' ? results[2].value : null,
        leaves: results[3].status === 'fulfilled' ? results[3].value : null,
        expenses: results[4].status === 'fulfilled' ? results[4].value : null,
        tasks: results[5].status === 'fulfilled' ? results[5].value : null,
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <LoadingState label="Gathering your workspace metrics" />;

  const greetingName = user?.username || 'there';
  const activeProjects = data.projects?.filter((project) => project.status.toLowerCase() === 'active').length;
  const activeAllocations = data.allocations?.filter((allocation) => allocation.status.toLowerCase() === 'allocated').length;
  const pendingLeaves = data.leaves?.filter((leave) => leave.status.toLowerCase() === 'pending').length;
  const pendingExpenses = data.expenses?.filter((expense) => expense.status.toLowerCase() === 'pending').length;
  const recentTasks = [...(data.tasks ?? [])].slice(0, 5);
  const metricValue = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString();

  return (
    <>
      <PageHeader eyebrow={dateLabel} title={`Good to see you, ${greetingName}`} description="Here’s the latest across your organization. Your workspace is looking in good shape." />
      <div className="mb-7 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-lg shadow-slate-900/10 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-300">Your organization at a glance</p>
            <h2 className="mt-2 text-xl font-semibold">A clearer view of what matters.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Stay on top of team activity, upcoming work, and decisions waiting for your attention.</p>
          </div>
          <Link to="/projects" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-indigo-50">Explore projects <Icon name="arrow" size={16} /></Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total employees" value={metricValue(data.employees ?? undefined)} detail="People in your organization" icon="users" color="bg-blue-50 text-blue-600" />
        <MetricCard label="Active projects" value={metricValue(activeProjects)} detail="Projects in execution" icon="briefcase" color="bg-indigo-50 text-indigo-600" />
        <MetricCard label="Assets allocated" value={metricValue(activeAllocations)} detail="Currently assigned assets" icon="cube" color="bg-violet-50 text-violet-600" />
        <MetricCard label="Pending leave" value={metricValue(pendingLeaves)} detail="Requests awaiting review" icon="calendar" color="bg-amber-50 text-amber-600" />
        <MetricCard label="Pending expenses" value={metricValue(pendingExpenses)} detail="Submissions awaiting review" icon="receipt" color="bg-emerald-50 text-emerald-600" />
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
            <div><h2 className="text-sm font-bold text-slate-900">Task activity</h2><p className="mt-1 text-xs text-slate-500">Latest work across your projects</p></div>
            <Link to="/projects" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">View projects <span aria-hidden="true">→</span></Link>
          </div>
          {recentTasks.length ? (
            <div className="divide-y divide-slate-100">
              {recentTasks.map((task) => <div key={task.public_id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{task.title}</p><p className="mt-1 truncate text-xs text-slate-500">{task.assigned_to_details ? `${task.assigned_to_details.first_name} ${task.assigned_to_details.last_name}` : 'Unassigned'} <span className="mx-1.5 text-slate-300">·</span> Due {formatDate(task.deadline)}</p></div>
                <StatusBadge status={task.status} />
              </div>)}
            </div>
          ) : <EmptyState title="No task activity yet" description="When tasks are created, the latest work will appear here." />}
        </Card>
        <Card className="p-5 sm:p-6">
          <p className="text-sm font-bold text-slate-900">Quick access</p>
          <p className="mt-1 text-xs text-slate-500">Jump back into the work you manage.</p>
          <div className="mt-5 space-y-2">
            {[
              { to: '/organization', icon: 'building' as const, label: 'Organization directory', meta: 'Teams and structure' },
              { to: '/assets', icon: 'cube' as const, label: 'Asset inventory', meta: 'Track allocations' },
              { to: '/leave', icon: 'calendar' as const, label: 'Leave management', meta: 'Requests and balances' },
              { to: '/expenses', icon: 'receipt' as const, label: 'Expense center', meta: 'Claims and reviews' },
            ].map((item) => <Link key={item.to} to={item.to} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-indigo-100 hover:bg-indigo-50/50">
              <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-white group-hover:text-indigo-600"><Icon name={item.icon} size={17} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{item.label}</span><span className="mt-0.5 block text-[10px] text-slate-500">{item.meta}</span></span>
              <Icon name="chevron" size={15} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
            </Link>)}
          </div>
        </Card>
      </div>
      <p className="mt-5 text-[11px] text-slate-400">Metrics reflect records available to your signed-in account.</p>
    </>
  );
}
