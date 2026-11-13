import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { endpoints, unwrapList } from '../../api/client';
import type { ApiListResponse, Expense, LeaveRequest } from '../../api/types';
import { useAuth } from '../../context/auth';
import { initials } from '../format';
import { Button, Icon, Modal, type IconName } from '../ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles?: string[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const adminNavGroups: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'grid' },
      { to: '/analytics', label: 'Analytics', icon: 'grid' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/admin/organizations', label: 'Organizations', icon: 'building' },
      { to: '/admin/branches', label: 'Branches', icon: 'briefcase' },
      { to: '/admin/org-chart', label: 'Organization Chart', icon: 'sitemap' },
      { to: '/admin/managers', label: 'Managers', icon: 'users' },
      { to: '/admin/employees', label: 'Employee Directory (Read Only)', icon: 'user' },
    ],
  },
  {
    group: 'Organization Monitoring',
    items: [
      { to: '/assets', label: 'Asset Overview', icon: 'cube' },
      { to: '/leave', label: 'Leave Overview', icon: 'calendar' },
      { to: '/attendance', label: 'Attendance Overview', icon: 'clock' },
      { to: '/expenses', label: 'Expense Overview', icon: 'receipt' },
      { to: '/performance', label: 'Performance Overview', icon: 'star' },
    ],
  },
];

const hrNavGroups: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'grid' },
    ],
  },
  {
    group: 'HR Management',
    items: [
      { to: '/organization', label: 'Employee Management', icon: 'users' },
      { to: '/admin/org-chart', label: 'Organization Chart', icon: 'sitemap' },
      { to: '/assets', label: 'Asset Management', icon: 'cube' },
      { to: '/leave', label: 'Leave Management', icon: 'calendar' },
      { to: '/attendance', label: 'Attendance Management', icon: 'clock' },
      { to: '/expenses', label: 'Expense Management', icon: 'receipt' },
      { to: '/performance', label: 'Performance Management', icon: 'star' },
    ],
  },
];

const projectManagerNavGroups: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'grid' },
    ],
  },
  {
    group: 'Project Management',
    items: [
      { to: '/pm/projects', label: 'My Projects', icon: 'briefcase' },
      { to: '/pm/directory', label: 'Employee Directory', icon: 'user' },
      { to: '/pm/team', label: 'Project Team', icon: 'users' },
      { to: '/pm/tasks', label: 'Task Management', icon: 'check-circle' },
      { to: '/pm/availability', label: 'Employee Availability', icon: 'calendar' },
      { to: '/pm/calendar', label: 'Schedule / Calendar', icon: 'clock' },
      { to: '/performance', label: 'Performance Reviews', icon: 'star' },
    ],
  },
];

const employeeNavGroups: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'grid' },
    ],
  },
  {
    group: 'Workspace & Deliverables',
    items: [
      { to: '#profile', label: 'My Profile', icon: 'user' },
      { to: '/projects', label: 'My Tasks', icon: 'check-circle' },
      { to: '/projects', label: 'My Projects', icon: 'briefcase' },
      { to: '/leave', label: 'My Leave', icon: 'calendar' },
      { to: '/attendance', label: 'My Attendance', icon: 'clock' },
      { to: '/expenses', label: 'My Expenses', icon: 'receipt' },
      { to: '/performance', label: 'My Performance', icon: 'star' },
    ],
  },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = Boolean(user?.is_superuser || user?.role_name === 'System Admin');
  const isHR = Boolean(!isAdmin && user?.role_name === 'HR Manager');
  const isPM = Boolean(!isAdmin && !isHR && user?.role_name === 'Department / Project Manager');

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingLeaves, setPendingLeaves] = useState<number | null>(null);
  const [pendingExpenses, setPendingExpenses] = useState<number | null>(null);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeNavGroups = isAdmin
    ? adminNavGroups
    : isHR
      ? hrNavGroups
      : isPM
        ? projectManagerNavGroups
        : employeeNavGroups;

  // Compute page title from route
  const currentTitle = useMemo(() => {
    if (location.pathname === '/admin/managers') return 'Managers';
    if (location.pathname === '/admin/organizations') return 'Organizations';
    if (location.pathname === '/admin/branches') return 'Branches';
    if (location.pathname === '/admin/employees') return 'Employee Directory (Read Only)';
    if (location.pathname === '/admin/org-chart') return 'Organization Chart';
    if (location.pathname === '/pm/directory') return 'Employee Directory';
    if (location.pathname === '/organization') return isHR ? 'Employee Management' : 'Organization';
    if (location.pathname === '/pm/projects') return 'My Projects';
    if (location.pathname === '/pm/team') return 'Project Team';
    if (location.pathname === '/pm/tasks') return 'Task Management';
    if (location.pathname === '/pm/availability') return 'Employee Availability';
    if (location.pathname === '/pm/calendar') return 'Schedule / Calendar';
    if (location.pathname === '/leave') return isAdmin ? 'Leave Overview' : isHR ? 'Leave Management' : 'My Leave';
    if (location.pathname === '/attendance') return isAdmin ? 'Attendance Overview' : isHR ? 'Attendance Management' : 'My Attendance';
    if (location.pathname === '/expenses') return isAdmin ? 'Expense Overview' : isHR ? 'Expense Management' : 'My Expenses';
    if (location.pathname === '/performance') return isAdmin ? 'Performance Overview' : isHR ? 'Performance Management' : isPM ? 'Performance Reviews' : 'My Performance';
    if (location.pathname === '/assets') return isAdmin ? 'Asset Overview' : 'Asset Management';
    if (location.pathname === '/projects') return 'My Projects & Tasks';

    for (const group of activeNavGroups) {
      for (const item of group.items) {
        if (location.pathname.startsWith(item.to)) {
          return item.label;
        }
      }
    }
    return 'Workspace';
  }, [location.pathname, activeNavGroups, isHR, isAdmin, isPM]);

  // Load pending approvals for notification pill
  useEffect(() => {
    let active = true;

    Promise.allSettled([
      api.get<ApiListResponse<LeaveRequest>>(endpoints.leaveRequests),
      api.get<ApiListResponse<Expense>>(endpoints.expenses),
    ]).then(([leaveResult, expenseResult]) => {
      if (!active) return;
      if (leaveResult.status === 'fulfilled') {
        const leaves = unwrapList(leaveResult.value.data);
        setPendingLeaves(leaves.filter((l) => (l.status || '').toLowerCase() === 'pending').length);
      }
      if (expenseResult.status === 'fulfilled') {
        const expenses = unwrapList(expenseResult.value.data);
        setPendingExpenses(
          expenses.filter((e) => (e.status || '').toLowerCase() === 'pending').length,
        );
      }
    });

    return () => {
      active = false;
    };
  }, [location.pathname]);

  const totalPending = isAdmin ? (pendingExpenses ?? 0) : (pendingLeaves ?? 0) + (pendingExpenses ?? 0);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const username = user?.username || 'User';
  const roleName = user?.role_name || (user?.is_superuser ? 'System Admin' : 'Employee');
  const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : username;

  const isItemVisible = (item: NavItem) => {
    if (!item.roles) return true;
    return hasRole(item.roles);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      {/* Brand Header */}
      <div className={`flex h-16 items-center border-b border-slate-800 ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
        <Link to="/dashboard" className="flex items-center gap-3 group">
          <img
            src="/logo.jpg"
            alt="Northstar ERP"
            className="size-9 shrink-0 rounded-lg object-cover shadow-md shadow-blue-950/40 ring-1 ring-blue-400/40 group-hover:ring-blue-400 transition"
          />
          {!collapsed && (
            <div className="min-w-0">
              <span className="block text-xs font-bold tracking-widest text-white uppercase font-sans">
                NORTHSTAR ERP
              </span>
              <span className="block text-[10px] font-medium tracking-wide text-blue-400/80">
                {isAdmin ? 'Admin Console' : 'Plan • Manage • Grow'}
              </span>
            </div>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="hidden lg:flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <Icon name="panel-left" size={15} />
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {activeNavGroups.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.group}>
              {!collapsed && (
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.group}
                </p>
              )}
              <nav className="space-y-1" aria-label={group.group}>
                {visibleItems.map((item) => {
                  if (item.to === '#profile') {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setMobileNavOpen(false);
                          setProfileOpen(true);
                        }}
                        title={collapsed ? item.label : undefined}
                        className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800/80 hover:text-white transition ${
                          collapsed ? 'justify-center' : ''
                        }`}
                      >
                        <Icon
                          name={item.icon}
                          size={17}
                          className="text-slate-400 group-hover:text-slate-200"
                        />
                        {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                      </button>
                    );
                  }

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileNavOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                          collapsed ? 'justify-center' : ''
                        } ${
                          isActive
                            ? 'bg-blue-600 text-white font-semibold shadow-xs'
                            : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            name={item.icon}
                            size={17}
                            className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}
                          />
                          {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                          {!collapsed && item.to === '/dashboard' && (
                            <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-slate-800 p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setProfileOpen(true)}
              className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="Profile"
              aria-label="Profile"
            >
              <Icon name="user" size={16} />
            </button>
            <button
              onClick={() => setCollapsed(false)}
              className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <Icon name="panel-left" size={16} />
            </button>
            <button
              onClick={handleLogout}
              className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-950/40 hover:text-rose-300 transition"
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg bg-slate-800/60 p-2.5 border border-slate-700/50">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Session Active</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400 truncate">
                Role: <span className="text-slate-300 font-semibold">{roleName}</span>
              </p>
            </div>
            <button
              onClick={() => setProfileOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800/80 hover:text-white transition"
            >
              <Icon name="user" size={15} />
              <span>Profile</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 hover:bg-rose-950/30 hover:text-rose-300 transition"
            >
              <Icon name="logout" size={15} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden transition-all duration-200 lg:block ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative h-full w-72 max-w-[85vw] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Wrap */}
      <div
        className={`transition-all duration-200 ${
          collapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/90 bg-white/95 px-4 backdrop-blur-md sm:px-8">
          {/* Left: Mobile hamburger & Page Breadcrumb / Title */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Open mobile menu"
            >
              <Icon name="menu" size={18} />
            </button>
            <Link to="/dashboard" className="flex items-center gap-2 lg:hidden">
              <img
                src="/logo.jpg"
                alt="Northstar ERP"
                className="size-8 rounded-lg object-cover shadow-xs ring-1 ring-slate-200"
              />
            </Link>
            <div>
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span>{isAdmin ? 'Admin Console' : 'Northstar ERP'}</span>
                <span>/</span>
                <span className="text-slate-600 font-semibold">{currentTitle}</span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                {currentTitle}
              </h1>
            </div>
          </div>

          {/* Right: Actions, Notifications & User Menu */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Status / Role Badge */}
            <span className="hidden items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-800 md:inline-flex">
              <Icon name="shield" size={12} />
              {roleName}
            </span>

            {/* Notifications Menu (Only shows relevant system items) */}
            <div className="relative" ref={notifMenuRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
              >
                <Icon name="bell" size={16} />
                {totalPending > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white ring-2 ring-white">
                    {totalPending > 9 ? '9+' : totalPending}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <p className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      {isAdmin ? 'System Notifications' : 'Approval Queue'}
                    </p>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {totalPending} Items
                    </span>
                  </div>

                  {isAdmin ? (
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <p className="font-semibold text-slate-800">Admin Control Session</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Manager, organization, and branch creation actions are active and audit-logged.
                        </p>
                      </div>
                      {Boolean(pendingExpenses && pendingExpenses > 0) && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                          <span className="font-medium text-slate-700">Pending Expense Claims</span>
                          <span className="font-bold text-slate-900">{pendingExpenses}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2">
                          <Icon name="calendar" size={15} className="text-blue-600" />
                          <span className="font-medium text-slate-700">Leave Requests</span>
                        </div>
                        <span className="font-bold text-slate-900">{pendingLeaves ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2">
                          <Icon name="receipt" size={15} className="text-emerald-600" />
                          <span className="font-medium text-slate-700">Expense Claims</span>
                        </div>
                        <span className="font-bold text-slate-900">{pendingExpenses ?? 0}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Link
                          to="/leave"
                          onClick={() => setNotificationsOpen(false)}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition"
                        >
                          View Leaves
                        </Link>
                        <Link
                          to="/expenses"
                          onClick={() => setNotificationsOpen(false)}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition"
                        >
                          View Expenses
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="hidden h-7 w-px bg-slate-200 sm:block" />

            {/* Profile Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2.5 rounded-lg p-1 text-left transition hover:bg-slate-100"
                aria-label="User account menu"
                aria-expanded={userMenuOpen}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white shadow-xs">
                  {initials(displayName || username)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="max-w-36 truncate text-xs font-bold text-slate-800 leading-tight">
                    {displayName}
                  </p>
                  <p className="max-w-36 truncate text-[10px] font-medium text-slate-500">
                    {roleName}
                  </p>
                </div>
                <Icon
                  name="chevron-down"
                  size={13}
                  className={`hidden sm:block text-slate-400 transition-transform ${
                    userMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="border-b border-slate-100 p-2.5">
                    <p className="text-xs font-bold text-slate-900 truncate">{displayName}</p>
                    <p className="text-[11px] text-slate-500 truncate">@{username}</p>
                    <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      <Icon name="shield" size={11} />
                      {roleName}
                    </div>
                  </div>

                    <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setProfileOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                    >
                      <Icon name="user" size={14} className="text-slate-400" />
                      View Profile
                    </button>
                    <Link
                      to="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                    >
                      <Icon name="grid" size={14} className="text-slate-400" />
                      Dashboard
                    </Link>

                    {isAdmin ? (
                      <>
                        <Link
                          to="/admin/managers"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="users" size={14} className="text-slate-400" />
                          Managers
                        </Link>
                        <Link
                          to="/admin/organizations"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="building" size={14} className="text-slate-400" />
                          Organizations
                        </Link>
                        <Link
                          to="/admin/branches"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="briefcase" size={14} className="text-slate-400" />
                          Branches
                        </Link>
                      </>
                    ) : isPM ? (
                      <>
                        <Link
                          to="/pm/projects"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="briefcase" size={14} className="text-slate-400" />
                          My Projects
                        </Link>
                        <Link
                          to="/pm/team"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="users" size={14} className="text-slate-400" />
                          Project Team
                        </Link>
                        <Link
                          to="/pm/tasks"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="check-circle" size={14} className="text-slate-400" />
                          Task Management
                        </Link>
                        <Link
                          to="/pm/availability"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="calendar" size={14} className="text-slate-400" />
                          Employee Availability
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          to="/leave"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="calendar" size={14} className="text-slate-400" />
                          My Time Off
                        </Link>
                        <Link
                          to="/expenses"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Icon name="receipt" size={14} className="text-slate-400" />
                          My Expenses
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                    >
                      <Icon name="logout" size={14} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>

        {/* Enterprise Footer */}
        <footer className="border-t border-slate-200/80 px-8 py-5 text-center text-[11px] font-medium text-slate-400">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <img
              src="/logo.jpg"
              alt="Northstar ERP"
              className="size-4 rounded-full object-cover inline-block ring-1 ring-slate-300"
            />
            <span className="font-semibold text-slate-600">NORTHSTAR ERP</span>
            <span>·</span>
            <span>Plan • Manage • Grow</span>
            <span>·</span>
            <span>All rights reserved</span>
          </div>
        </footer>
      </div>

      {/* User Profile Modal */}
      {profileOpen && (
        <Modal
          title="Account Profile"
          description="Enterprise identity and authorization details for current session."
          onClose={() => setProfileOpen(false)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-xs">
                  {initials(displayName || username)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900 truncate">{displayName}</h3>
                  <p className="text-xs font-mono text-slate-500">@{username}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-100/80 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                    <Icon name="shield" size={12} />
                    {roleName}
                  </div>
                </div>
              </div>
              <img
                src="/logo.jpg"
                alt="Northstar ERP"
                className="hidden sm:block size-12 shrink-0 rounded-full object-cover ring-2 ring-blue-500/20 shadow-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Email Address</p>
                <p className="mt-1 font-semibold text-slate-800 break-all">{user?.email || 'Not configured'}</p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Role Classification</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {user?.is_superuser ? 'Superuser Administrator' : roleName}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Authentication Model</p>
                <p className="mt-1 font-semibold text-emerald-700">In-Memory JWT Credentials</p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Session Security</p>
                <p className="mt-1 font-semibold text-slate-800">Active & Verified</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setProfileOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
