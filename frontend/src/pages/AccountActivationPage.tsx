import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { client } from '../api/client';
import { displayError } from '../components/format';
import { Button, Card, ErrorMessage, Field, Icon } from '../components/ui';

export default function AccountActivationPage() {
  const params = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();

  // Token resolution from URL path (:token) or query string (?token=...)
  const initialToken = params.token || searchParams.get('token') || '';
  const initialEmail = searchParams.get('email') || '';
  const initialName = searchParams.get('name') || '';

  const [token, setToken] = useState(initialToken);
  const [employeeName, setEmployeeName] = useState(initialName || 'Employee');
  const [employeeEmail, setEmployeeEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [backendWarning, setBackendWarning] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [activatedSuccess, setActivatedSuccess] = useState(false);
  const [currentYear] = useState(() => new Date().getFullYear());

  // Validate token with backend if token exists
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    async function verify() {
      setVerifying(true);
      setTokenError('');
      setBackendWarning('');

      try {
        const res = await client.verifyActivationToken(token);
        if (!isMounted) return;
        if (res.data?.valid) {
          if (res.data.employee_name) setEmployeeName(res.data.employee_name);
          if (res.data.email) setEmployeeEmail(res.data.email);
        } else {
          setTokenError('This invitation token is invalid, expired, or has already been used.');
        }
      } catch (cause) {
        if (!isMounted) return;
        // Check if endpoint is not implemented (404/501)
        const isNotImplemented =
          cause instanceof Error &&
          'response' in cause &&
          (cause as { response?: { status?: number } }).response?.status === 404;

        if (isNotImplemented) {
          // Transparently inform that backend activation service requires backend endpoint
          setBackendWarning(
            'Backend Note: Dedicated account activation endpoint (/api/users/activate/) is not implemented on the Django server. Onboarding validation interface is running in client verification mode.',
          );
        } else {
          setTokenError(displayError(cause) || 'Unable to verify invitation token.');
        }
      } finally {
        if (isMounted) setVerifying(false);
      }
    }

    void verify();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // Password Strength Calculation
  const passwordCriteria = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least one uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'At least one number (0-9)', met: /[0-9]/.test(password) },
    { label: 'At least one special character (!@#$%^&*)', met: /[^A-Za-z0-9]/.test(password) },
  ];
  const isPasswordStrong = passwordCriteria.every((c) => c.met);
  const passwordsMatch = password.length > 0 && password === passwordConfirm;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');

    if (!token.trim()) {
      setFormError('An invitation token is required to activate your account.');
      return;
    }
    if (!isPasswordStrong) {
      setFormError('Please ensure your password meets all enterprise security criteria.');
      return;
    }
    if (!passwordsMatch) {
      setFormError('The password confirmation does not match the entered password.');
      return;
    }

    setSubmitting(true);
    try {
      await client.activateAccount({
        token: token.trim(),
        password,
        password_confirm: passwordConfirm,
      });

      setActivatedSuccess(true);
    } catch (cause) {
      setFormError(displayError(cause) || 'Unable to activate account. Please contact HR.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Background ambient accents */}
      <div className="absolute top-1/4 -left-32 size-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 size-96 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="Northstar ERP"
              className="size-12 rounded-xl object-cover ring-2 ring-blue-500/30 shadow-lg shadow-blue-950/60"
            />
            <div className="text-left">
              <span className="block text-base font-bold tracking-widest text-white uppercase">
                NORTHSTAR ERP
              </span>
              <span className="block text-xs font-semibold text-blue-400">
                Plan • Manage • Grow
              </span>
            </div>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Employee Account Activation
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Welcome to the Northstar ERP system. Setup your password to activate your workspace account.
            </p>
          </div>
        </div>

        {backendWarning && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-4 text-xs text-amber-200">
            <div className="flex gap-2.5">
              <Icon name="shield" size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300">Backend Capability Notice</p>
                <p className="mt-1 text-[11px] text-amber-200/90 leading-relaxed">
                  {backendWarning}
                </p>
              </div>
            </div>
          </div>
        )}

        {tokenError && (
          <ErrorMessage>
            <div className="space-y-2">
              <p>{tokenError}</p>
              <p className="text-[11px] text-rose-300">
                Please check the activation URL sent by your HR Manager or request a new invitation link.
              </p>
            </div>
          </ErrorMessage>
        )}

        {activatedSuccess ? (
          <Card className="p-6 sm:p-8 space-y-5 border-slate-800 bg-slate-900/90 text-white shadow-2xl">
            <div className="flex flex-col items-center text-center space-y-3">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
                <Icon name="check-circle" size={28} />
              </span>
              <h2 className="text-lg font-bold text-white">Account Successfully Activated!</h2>
              <p className="text-xs text-slate-300 leading-relaxed max-w-sm">
                Your enterprise credentials have been verified. You can now log in to the Northstar ERP
                workspace with your official credentials and access your Employee Dashboard.
              </p>
            </div>

            <div className="pt-2">
              <Link to="/login" className="block w-full">
                <Button variant="primary" size="lg" className="w-full">
                  <span>Proceed to Employee Login</span>
                  <Icon name="arrow" size={15} />
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8 space-y-6 border-slate-800 bg-slate-900/90 text-white shadow-2xl">
            {/* Account Details Banner */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Employee Name:</span>
                <span className="font-semibold text-white">{employeeName}</span>
              </div>
              {employeeEmail && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Official Email:</span>
                  <span className="font-mono text-slate-300">{employeeEmail}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Authorized Role:</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300 border border-blue-500/30">
                  <Icon name="shield" size={12} />
                  Employee (Locked)
                </span>
              </div>
            </div>

            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Token Input (if not present in URL) */}
              {!initialToken && (
                <Field
                  label="Invitation Token"
                  type="text"
                  name="token"
                  required
                  placeholder="Paste your activation token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  hint="Provide the single-use onboarding token received from HR"
                />
              )}

              {/* Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Create Account Password <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter secure password"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-xs text-white placeholder-slate-500 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 hover:text-white"
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Confirm Password <span className="text-rose-400">*</span>
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Password strength checklist */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-1.5 text-[11px]">
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                  Enterprise Password Requirements
                </p>
                {passwordCriteria.map((c) => (
                  <div
                    key={c.label}
                    className={`flex items-center gap-2 ${
                      c.met ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {c.met ? (
                      <Icon name="check" size={12} />
                    ) : (
                      <span className="size-1.5 rounded-full bg-slate-600 ml-1 mr-0.5" />
                    )}
                    <span>{c.label}</span>
                  </div>
                ))}
                {passwordConfirm && (
                  <div
                    className={`flex items-center gap-2 pt-1 border-t border-slate-800 ${
                      passwordsMatch ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {passwordsMatch ? (
                      <Icon name="check" size={12} />
                    ) : (
                      <span className="size-1.5 rounded-full bg-rose-500 ml-1 mr-0.5" />
                    )}
                    <span>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={submitting || verifying || !token.trim() || !isPasswordStrong || !passwordsMatch}
              >
                {submitting ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Activating Account…</span>
                  </>
                ) : (
                  <>
                    <Icon name="shield" size={15} />
                    <span>Activate Account & Complete Onboarding</span>
                  </>
                )}
              </Button>
            </form>

            <div className="pt-2 text-center text-xs text-slate-500">
              Already have an activated account?{' '}
              <Link to="/login" className="font-semibold text-blue-400 hover:text-blue-300">
                Sign in here
              </Link>
            </div>
          </Card>
        )}

        <p className="text-center text-[11px] text-slate-500">
          © {currentYear} Northstar ERP · Enterprise Operations Workspace
        </p>
      </div>
    </main>
  );
}
