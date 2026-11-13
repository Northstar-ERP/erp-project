import {
  useEffect,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export type IconName =
  | 'grid'
  | 'building'
  | 'briefcase'
  | 'cube'
  | 'calendar'
  | 'receipt'
  | 'users'
  | 'bell'
  | 'search'
  | 'plus'
  | 'arrow'
  | 'chevron'
  | 'chevron-down'
  | 'menu'
  | 'close'
  | 'logout'
  | 'check'
  | 'check-circle'
  | 'x-circle'
  | 'clock'
  | 'refresh'
  | 'filter'
  | 'sort'
  | 'user'
  | 'shield'
  | 'alert'
  | 'info'
  | 'edit'
  | 'trash'
  | 'download'
  | 'panel-left'
  | 'help'
  | 'sitemap'
  | 'star';

const iconPaths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  building: <><path d="M3 21h18M5 21V5l7-2v18M19 21V9l-7-2" /><path d="M8 7h1m-1 4h1m-1 4h1m7-2h1m-1 4h1" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2" /></>,
  cube: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  'check-circle': <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>,
  'x-circle': <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6m0-6 6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3" /></>,
  filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>,
  sort: <><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  edit: <><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></>,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
  'panel-left': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></>,
  sitemap: <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /></>,
  star: <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
};

export function Icon({
  name,
  size = 18,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline-danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'min-h-8 px-2.5 py-1 text-xs gap-1.5 rounded-lg',
    md: 'min-h-9 px-3.5 py-1.5 text-xs font-semibold gap-2 rounded-lg',
    lg: 'min-h-11 px-4 py-2.5 text-sm font-semibold gap-2.5 rounded-xl',
  };

  const variantClasses = {
    primary:
      'bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
    secondary:
      'border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
    ghost:
      'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500',
    danger:
      'bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2',
    'outline-danger':
      'border border-rose-200 bg-white text-rose-600 shadow-xs hover:bg-rose-50 active:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2',
  };

  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition select-none focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-xs ${className}`}
    >
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const key = (status || '').toLowerCase().trim();

  // Determine semantic color category
  const isPositive =
    key.includes('approv') ||
    key === 'active' ||
    key === 'available' ||
    key === 'done' ||
    key === 'returned' ||
    key === 'paid';

  const isWarning =
    key.includes('pending') ||
    key === 'planning' ||
    key.includes('progress') ||
    key === 'allocated' ||
    key === 'review' ||
    key === 'on hold';

  const isNegative =
    key.includes('reject') ||
    key === 'lost' ||
    key === 'retired' ||
    key === 'inactive' ||
    key === 'terminated' ||
    key === 'resigned';

  let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotStyle = 'bg-slate-400';

  if (isPositive) {
    badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    dotStyle = 'bg-emerald-500';
  } else if (isWarning) {
    badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
    dotStyle = 'bg-amber-500';
  } else if (isNegative) {
    badgeStyle = 'bg-rose-50 text-rose-800 border-rose-200';
    dotStyle = 'bg-rose-500';
  }

  const label = status ? status.replaceAll('_', ' ') : '—';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight capitalize ${badgeStyle}`}
    >
      <span className={`size-1.5 rounded-full shrink-0 ${dotStyle}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            {idx > 0 && <span className="text-slate-300">/</span>}
            {isLast ? (
              <span className="font-semibold text-slate-800" aria-current="page">
                {item.label}
              </span>
            ) : item.href ? (
              <a href={item.href} className="hover:text-blue-600 transition">
                {item.label}
              </a>
            ) : (
              <span>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200/70 pb-5 sm:flex-row sm:items-end">
      <div>
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        {eyebrow && !breadcrumbs && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-xs sm:text-sm text-slate-500">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className={`grid gap-1.5 text-xs font-semibold text-slate-700 ${className}`}>
      <span>
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <input
        required={required}
        className={`min-h-9.5 w-full rounded-lg border bg-white px-3 py-2 text-xs font-normal text-slate-900 outline-hidden transition placeholder:text-slate-400 focus:ring-3 ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
            : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
        }`}
        {...props}
      />
      {hint && !error && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
      {error && <span className="text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`grid gap-1.5 text-xs font-semibold text-slate-700 ${className}`}>
      <span>
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <select
        required={required}
        className={`min-h-9.5 w-full rounded-lg border bg-white px-3 py-2 text-xs font-normal text-slate-900 outline-hidden transition focus:ring-3 ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
            : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
        }`}
        {...props}
      >
        {children}
      </select>
      {hint && !error && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
      {error && <span className="text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  required,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className={`grid gap-1.5 text-xs font-semibold text-slate-700 ${className}`}>
      <span>
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <textarea
        required={required}
        className={`min-h-24 w-full resize-y rounded-lg border bg-white px-3 py-2 text-xs font-normal text-slate-900 outline-hidden transition placeholder:text-slate-400 focus:ring-3 ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
            : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
        }`}
        {...props}
      />
      {hint && !error && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
      {error && <span className="text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

export function Modal({
  title,
  description,
  onClose,
  maxWidth = 'max-w-lg',
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-xs"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`my-8 w-full ${maxWidth} rounded-xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7`}
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 id="modal-title" className="text-base font-bold text-slate-900 sm:text-lg">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  return (
    <Modal title={title} onClose={onCancel} maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search records…',
  className = '',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Icon
        name="search"
        size={15}
        className="absolute left-3 text-slate-400 pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 outline-hidden transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 text-slate-400 hover:text-slate-600"
          aria-label="Clear search"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (newPage: number) => void;
}) {
  if (totalPages <= 1 && !totalItems) return null;

  const startItem = totalItems && pageSize ? (page - 1) * pageSize + 1 : undefined;
  const endItem =
    totalItems && pageSize ? Math.min(page * pageSize, totalItems) : undefined;

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:px-6">
      <div>
        {startItem && endItem && totalItems ? (
          <span>
            Showing <strong className="font-semibold text-slate-800">{startItem}</strong> to{' '}
            <strong className="font-semibold text-slate-800">{endItem}</strong> of{' '}
            <strong className="font-semibold text-slate-800">{totalItems}</strong> entries
          </span>
        ) : (
          <span>
            Page <strong className="font-semibold text-slate-800">{page}</strong> of{' '}
            <strong className="font-semibold text-slate-800">{totalPages}</strong>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="px-2 text-xs font-semibold text-slate-700">
          {page} / {totalPages || 1}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = 'grid',
  action,
}: {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3.5 flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({
  label = 'Loading workspace data…',
}: {
  label?: string;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-xs font-medium text-slate-500">
      <span
        className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3.5 py-3 text-xs text-rose-800"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-rose-600" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-3 text-xs text-emerald-800"
    >
      <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-emerald-600" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
