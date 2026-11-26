import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/auth';
import { Card, LoadingState, PageHeader } from '../components/ui';
import { Link } from 'react-router-dom';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f5f7fb]"><LoadingState /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RoleRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { hasRole, user } = useAuth();
  if (hasRole(roles)) return children;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Access restricted"
        title="You don’t have permission to view this page"
        description={`Signed in as ${user?.username ?? 'your account'} (${user?.role_name ?? 'unassigned role'}).`}
      />
      <Card className="p-6">
        <p className="text-sm leading-6 text-slate-600">
          This area requires one of these roles: {roles.join(', ')}. Your account can still
          use the pages available to its role. Ask a System Admin or HR Manager if you
          need access.
        </p>
        <Link
          to="/dashboard"
          className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Return to dashboard
        </Link>
      </Card>
    </div>
  );
}
