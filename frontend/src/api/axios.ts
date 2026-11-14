
import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retriedAfterRefresh?: boolean;
  }
}

const baseURL =
  import.meta.env.VITE_API_BASE_URL ??
  'http://127.0.0.1:8000/api/';

export const api = axios.create({
  baseURL: baseURL.endsWith('/') ? baseURL : `${baseURL}/`,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;

  if (!token) {
    delete api.defaults.headers.common.Authorization;
  } else {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }
}

export function setRefreshToken(token: string | null): void {
  refreshToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function clearTokens(): void {
  setAccessToken(null);
  setRefreshToken(null);
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & {
          _retriedAfterRefresh?: boolean;
        })
      | undefined;

    const isRefreshRequest = originalRequest?.url?.includes(
      '/users/auth/token/refresh/',
    );

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retriedAfterRefresh ||
      isRefreshRequest ||
      !refreshToken
    ) {
      return Promise.reject(error);
    }

    originalRequest._retriedAfterRefresh = true;

    refreshInFlight ??= axios
      .post<{ access: string; refresh?: string }>(
        `${api.defaults.baseURL}users/auth/token/refresh/`,
        { refresh: refreshToken },
      )
      .then(({ data }) => {
        if (!data.access) {
          throw new Error('The refresh endpoint did not return an access token.');
        }

        setAccessToken(data.access);

        if (data.refresh) {
          setRefreshToken(data.refresh);
        }

        return data.access;
      })
      .catch((refreshError: unknown) => {
        clearTokens();
        window.dispatchEvent(new Event('erp:authentication-expired'));
        throw refreshError;
      })
      .finally(() => {
        refreshInFlight = null;
      });

    try {
      const token = await refreshInFlight;
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

export default api;
