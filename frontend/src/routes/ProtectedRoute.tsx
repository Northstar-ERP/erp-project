import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/auth';
import { Card, LoadingState, PageHeader, Button, Icon } from '../components/ui';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <LoadingState label="Verifying session and permissions…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function RoleRoute({
  roles,
  children,
}: {
  roles: string[];
  children: ReactNode;
}) {
  const { hasRole, user } = useAuth();

  if (hasRole(roles)) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <PageHeader
        eyebrow="Access Control"
        title="Access Restricted"
        description={`Signed in as ${user?.username ?? 'account'} (${user?.role_name || 'Unassigned Role'}).`}
      />
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Icon name="shield" size={20} />
          </span>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Administrative Permission Required
            </h2>
            <p className="text-xs leading-relaxed text-slate-600">
              This area is restricted to members with one of the following roles:
              <strong className="ml-1 text-slate-800">{roles.join(', ')}</strong>.
              Your account has access to the modules and self-service features assigned
              to your role. Please contact your organization administrator if you need expanded
              permissions.
            </p>
            <div className="pt-2">
              <Link to="/dashboard">
                <Button variant="secondary" size="sm">
                  <Icon name="arrow" size={14} className="rotate-180" /> Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
