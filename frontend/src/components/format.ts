export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

export function displayError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string; [key: string]: unknown } } }).response;
    const detail = response?.data?.detail;
    if (detail) return detail;
    const firstValue = Object.values(response?.data ?? {}).find((value) => typeof value === 'string');
    if (firstValue) return String(firstValue);
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
