export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

export function displayError(
  error: unknown,
  fallback = 'Unable to process request. Please try again.',
): string {
  if (typeof error === 'string' && error.trim().length > 1) {
    return error.trim();
  }

  if (typeof error === 'object' && error !== null) {
    const resp = (error as { response?: { status?: number; data?: unknown } }).response;
    if (resp && resp.data !== undefined && resp.data !== null) {
      const data = resp.data;

      // 1. Plain string response from backend
      if (typeof data === 'string' && data.trim()) {
        const trimmed = data.trim();
        if (trimmed.startsWith('<')) {
          return resp.status ? `Server error (${resp.status}). Please try again.` : fallback;
        }
        if (trimmed.length > 1) {
          return trimmed;
        }
      }

      // 2. Array of error messages (e.g. Django non-field errors or list of validation messages)
      if (Array.isArray(data) && data.length > 0) {
        const msgs = data
          .map((item) =>
            typeof item === 'string'
              ? item.trim()
              : typeof item === 'object' && item !== null
              ? JSON.stringify(item)
              : String(item),
          )
          .filter(Boolean);
        const joined = msgs.join(' ');
        if (joined.length > 1) {
          return joined;
        }
      }

      // 3. Object with detail / message / error / non_field_errors / field validation errors
      if (typeof data === 'object' && !Array.isArray(data)) {
        const dataObj = data as Record<string, unknown>;

        if (typeof dataObj.detail === 'string' && dataObj.detail.trim().length > 1) {
          return dataObj.detail.trim();
        }
        if (Array.isArray(dataObj.detail) && dataObj.detail.length > 0) {
          const joined = dataObj.detail.map(String).join(' ').trim();
          if (joined.length > 1) return joined;
        }
        if (typeof dataObj.message === 'string' && dataObj.message.trim().length > 1) {
          return dataObj.message.trim();
        }
        if (Array.isArray(dataObj.non_field_errors) && dataObj.non_field_errors.length > 0) {
          const joined = dataObj.non_field_errors.map(String).join(' ').trim();
          if (joined.length > 1) return joined;
        }
        if (typeof dataObj.error === 'string' && dataObj.error.trim().length > 1) {
          return dataObj.error.trim();
        }

        // Field validation errors (e.g. { comment: ['This field is required.'] })
        const parts: string[] = [];
        for (const [key, val] of Object.entries(dataObj)) {
          if (val === null || val === undefined) continue;
          let valStr = '';
          if (typeof val === 'string') {
            valStr = val.trim();
          } else if (Array.isArray(val)) {
            valStr = val
              .map((v) => (typeof v === 'string' ? v.trim() : JSON.stringify(v)))
              .filter(Boolean)
              .join(' ');
          } else if (typeof val === 'object') {
            valStr = JSON.stringify(val);
          }

          if (valStr) {
            if (['non_field_errors', 'detail', 'error', 'message'].includes(key)) {
              parts.push(valStr);
            } else {
              const fieldName = key.replace(/_/g, ' ');
              const capitalized = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
              parts.push(`${capitalized}: ${valStr}`);
            }
          }
        }

        if (parts.length > 0) {
          const joined = parts.join(' ').trim();
          if (joined.length > 1) {
            return joined;
          }
        }
      }
    }

    if (error instanceof Error && error.message) {
      if (error.message.toLowerCase() === 'network error') {
        return 'Network error: Unable to connect to server. Please check your connection.';
      }
      if (!error.message.startsWith('Request failed with status code')) {
        return error.message;
      }
    }
  }

  return fallback;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
