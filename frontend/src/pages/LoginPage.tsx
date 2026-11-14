import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { Button, ErrorMessage, Icon, Field } from '../components/ui';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentYear] = useState(() => new Date().getFullYear());

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || '/dashboard', { replace: true });
    } catch (cause) {
      const detail =
        cause instanceof Error && 'response' in cause
          ? String(
              (cause as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
                'Unable to sign in. Verify your credentials and try again.',
            )
          : 'Unable to sign in. Verify your credentials and try again.';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.1fr_0.9fr]">
      {/* Visual Enterprise Banner */}
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute -right-32 -top-32 size-96 rounded-full border border-blue-500/10" />
        <div className="absolute -bottom-48 -left-32 size-[480px] rounded-full bg-blue-600/15 blur-3xl" />

        <div className="relative flex items-center gap-3.5">
          <img
            src="/logo.jpg"
            alt="Northstar ERP"
            className="size-11 rounded-xl object-cover ring-2 ring-blue-400/40 shadow-lg shadow-blue-950/60"
          />
          <div>
            <span className="block text-sm font-bold tracking-widest text-white uppercase font-sans">
              NORTHSTAR ERP
            </span>
            <span className="block text-[11px] font-medium tracking-wide text-blue-400/90">
              Plan • Manage • Grow
            </span>
          </div>
        </div>

        <div className="relative my-4 flex items-center justify-center">
          <div className="relative group">
            <div className="absolute -inset-3 rounded-full bg-blue-500/20 blur-2xl transition duration-500 group-hover:bg-blue-400/30" />
            <img
              src="/logo.jpg"
              alt="Northstar ERP"
              className="relative size-44 sm:size-52 rounded-full object-cover shadow-2xl ring-4 ring-blue-500/30 transition duration-300 hover:scale-[1.02]"
            />
          </div>
        </div>

        <div className="relative max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-blue-300">
            <Icon name="shield" size={13} />
            <span>Secure Enterprise Architecture</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-white xl:text-5xl leading-tight">
            Enterprise Operations, <br />
            <span className="text-blue-400">Unified & Clear.</span>
          </h1>

          <p className="text-sm leading-relaxed text-slate-400">
            A cohesive operational platform built for workforce planning, project delivery, hardware
            tracking, and financial governance.
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {[
              'Role-Based Authorization',
              'Dual JWT Authentication',
              'Audit-Logged Operations',
              'Hardware Lifecycle',
            ].map((badge) => (
              <span
                key={badge}
                className="rounded-md border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div className="relative text-[10px] font-medium tracking-wider uppercase text-slate-500">
          NORTHSTAR ERP · SECURE WORKSPACE OPERATIONS
        </div>
      </section>

      {/* Login Form Screen */}
      <section className="flex min-h-screen items-center justify-center bg-slate-50/50 px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Brand Header */}
          <div className="flex items-center gap-3 pb-2">
            <img
              src="/logo.jpg"
              alt="Northstar ERP"
              className="size-12 rounded-xl object-cover ring-2 ring-blue-600/20 shadow-md"
            />
            <div>
              <span className="block text-sm font-bold tracking-widest text-slate-900 uppercase">
                NORTHSTAR ERP
              </span>
              <span className="block text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                Plan • Manage • Grow
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign in to your account
            </h2>
            <p className="mt-1.5 text-xs text-slate-500">
              Enter your corporate credentials to access the Northstar ERP system.
            </p>
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Username"
              type="text"
              name="username"
              required
              autoComplete="username"
              placeholder="e.g. employee.username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <Field
              label="Password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting || loading || !username.trim() || !password}
            >
              {submitting ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <Icon name="arrow" size={15} />
                </>
              )}
            </Button>
          </form>

          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <Icon name="shield" size={16} />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-800">Protected Enterprise Session</p>
                <p className="text-[10px] text-slate-500">
                  Secured with in-memory tokens and automated refresh handling.
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400">
            © {currentYear} Northstar Enterprise Systems · All rights reserved
          </p>
        </div>
      </section>
    </main>
  );
}
