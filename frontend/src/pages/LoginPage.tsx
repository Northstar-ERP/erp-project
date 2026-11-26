import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { Button, ErrorMessage, Icon } from '../components/ui';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentYear] = useState(() => new Date().getFullYear());

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || '/dashboard', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error && 'response' in cause
          ? String((cause as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Unable to sign in. Verify your credentials and try again.')
          : 'Unable to sign in. Verify your credentials and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-40 -top-32 size-[520px] rounded-full border border-indigo-300/10" />
        <div className="absolute -right-16 -top-8 size-[360px] rounded-full border border-indigo-300/10" />
        <div className="absolute -bottom-48 -left-32 size-[480px] rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-500 text-sm font-black">N</span>
          <span className="text-sm font-bold tracking-[0.16em]">NORTHSTAR <span className="font-medium text-slate-500">ERP</span></span>
        </div>
        <div className="relative max-w-xl pb-8">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">One connected organization</p>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-tight xl:text-6xl">Your business,<br /><span className="text-indigo-300">in clear view.</span></h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-400">A thoughtful operating space for the people, projects, and decisions that move your organization forward.</p>
          <div className="mt-10 flex flex-wrap gap-2">
            {['Role-aware access', 'Audit-ready records', 'JWT secured'].map((label) => <span key={label} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-slate-300">{label}</span>)}
          </div>
        </div>
        <p className="relative text-[10px] font-medium tracking-[0.14em] text-slate-600">SECURE ENTERPRISE OPERATIONS <span className="mx-2">·</span> BUILT FOR TEAMS</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-12 lg:hidden">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white">N</span><span className="text-sm font-bold tracking-[0.16em]">NORTHSTAR ERP</span></div>
          </div>
          <div className="mb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Welcome back</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Sign in to your workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Use your organization account to continue.</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Username
              <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your username" className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Password
              <input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
            </label>
            <Button type="submit" disabled={submitting || loading} className="mt-2 w-full !min-h-12">
              {submitting ? <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Signing in…</> : <>Continue <Icon name="arrow" size={16} /></>}
            </Button>
          </form>
          <div className="mt-9 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm"><Icon name="check" size={17} /></span>
            <div><p className="text-xs font-semibold text-slate-700">Protected access</p><p className="mt-0.5 text-[11px] text-slate-500">Your session is secured with organization authentication.</p></div>
          </div>
          <p className="mt-10 text-center text-[11px] text-slate-400">© {currentYear} Northstar Enterprise <span className="mx-1">·</span> All rights reserved</p>
        </div>
      </section>
    </main>
  );
}
