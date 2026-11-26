import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { endpoints, unwrapList } from '../../api/client';
import type { ApiListResponse, Expense, LeaveRequest } from '../../api/types';
import { useAuth } from '../../context/auth';
import { initials } from '../format';
import { Icon } from '../ui';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: 'grid' as const },
  { to: '/analytics', label: 'Analytics', icon: 'grid' as const },
  { to: '/organization', label: 'Organization', icon: 'building' as const },
  { to: '/projects', label: 'Projects & tasks', icon: 'briefcase' as const },
  { to: '/assets', label: 'Assets', icon: 'cube' as const },
  { to: '/leave', label: 'Leave management', icon: 'calendar' as const },
  { to: '/expenses', label: 'Expenses', icon: 'receipt' as const },
];

function readableRole(role: string): string {
  return role || 'Team member';
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const pageTitle = useMemo(
    () => navigation.find((item) => location.pathname.startsWith(item.to))?.label ?? 'Workspace',
    [location.pathname],
  );
  const username = user?.username || 'User';

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.get<ApiListResponse<LeaveRequest>>(endpoints.leaveRequests),
      api.get<ApiListResponse<Expense>>(endpoints.expenses),
    ]).then(([leaveResult, expenseResult]) => {
      if (!active) return;
      const leaves = leaveResult.status === 'fulfilled' ? unwrapList(leaveResult.value.data) : [];
      const expenses = expenseResult.status === 'fulfilled' ? unwrapList(expenseResult.value.data) : [];
      setPendingCount(
        [...leaves, ...expenses].filter((item) => item.status?.toLowerCase() === 'pending').length,
      );
    });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <Link to="/dashboard" className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-500 text-sm font-black text-white shadow-lg shadow-indigo-950/40">N</span>
        <span>
          <span className="block text-sm font-bold tracking-wide text-white">NORTHSTAR</span>
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Enterprise ERP</span>
        </span>
      </Link>
      <div className="px-4 pt-7">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
        <nav className="space-y-1" aria-label="Primary navigation">
          {navigation
            .filter(({ to }) => to === '/dashboard' ||
to === '/analytics' ||
to === '/leave' ||
to === '/expenses' ||
hasRole(
              to === '/organization'
                ? ['System Admin', 'HR Manager']
                : to === '/projects'
                  ? ['System Admin', 'HR Manager', 'Department / Project Manager']
                  : ['System Admin', 'HR Manager', 'Department / Project Manager', 'Employee', 'IT'],
            ))
            .map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition ${
                  isActive
                    ? 'bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={icon} size={18} className={isActive ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'} />
                  <span className="flex-1">{label}</span>
                  {to === '/dashboard' && <span className="size-1.5 rounded-full bg-emerald-400" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold text-white">Your workspace</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Securely connected to your organization.</p>
          <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Session active
          </div>
        </div>
        <button onClick={handleLogout} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200">
          <Icon name="logout" size={17} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] lg:block">{sidebar}</aside>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />
          <aside className="relative h-full w-[280px] shadow-2xl">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
            <div>
              <p className="hidden text-[11px] font-medium text-slate-400 sm:block">Northstar workspace</p>
              <p className="truncate text-sm font-semibold text-slate-800">{pageTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 sm:flex"><span className="size-1.5 rounded-full bg-emerald-500" /> {user?.employment_status || 'Authenticated'}</span>
            <div className="relative">
              <button onClick={() => setNotificationsOpen((open) => !open)} className="relative flex size-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label="Notifications" aria-expanded={notificationsOpen}>
                <Icon name="bell" />
                {!!pendingCount && pendingCount > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-indigo-500 ring-2 ring-white" />}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-30 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">Notifications</p>
                    <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">{pendingCount ?? 0} pending</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{pendingCount === null ? 'Pending items will appear here when available.' : pendingCount ? 'There are pending leave or expense items in your workspace.' : 'You’re all caught up. No pending approvals.'}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link onClick={() => setNotificationsOpen(false)} to="/leave" className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-100">Leave requests</Link>
                    <Link onClick={() => setNotificationsOpen(false)} to="/expenses" className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-100">Expenses</Link>
                  </div>
                </div>
              )}
            </div>
            <div className="hidden h-9 w-px bg-slate-200 sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-40 truncate text-xs font-bold text-slate-800">{username}</p>
                <p className="mt-0.5 max-w-40 truncate text-[10px] font-medium text-slate-500">{readableRole(user?.role_name ?? '')}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-xs font-bold text-indigo-700 ring-1 ring-inset ring-indigo-200">{initials(username)}</div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-8 sm:py-9">
          <Outlet />
        </main>
        <footer className="px-8 pb-6 text-center text-[10px] font-medium tracking-wide text-slate-400">NORTHSTAR ERP <span className="mx-1.5">·</span> SECURE BUSINESS OPERATIONS</footer>
      </div>
    </div>
  );
}
