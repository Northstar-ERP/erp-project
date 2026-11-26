
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { jwtDecode } from 'jwt-decode';
import api, {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '../api/axios';
import { endpoints } from '../api/client';
import type { UserProfile } from '../api/types';
import { AuthContext } from './auth';

interface JwtClaims {
  user_id?: string;
  username?: string;
  role?: string | null;
  is_superuser?: boolean;
}

interface LoginResponse {
  access: string;
  refresh: string;
}

interface RefreshResponse {
  access: string;
  refresh?: string;
}

function normalizeProfile(
  data: Record<string, unknown>,
  claims: JwtClaims,
): UserProfile {
  const profileUser = (data.user_details ?? data.user ?? {}) as Record<
    string,
    unknown
  >;

  const hasEmployeeDetails =
    typeof data.user_details === 'object' && data.user_details !== null;

  const nestedRole = profileUser.role as
    | { role_name?: string }
    | string
    | null
    | undefined;

  const profileRoleName =
    (typeof nestedRole === 'object' && nestedRole?.role_name) ||
    (typeof nestedRole === 'string' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      nestedRole,
    )
      ? nestedRole
      : '');

  const roleName = profileRoleName || claims.role || 'Unknown';

  const role =
    typeof nestedRole === 'object' && nestedRole?.role_name
      ? { role_name: nestedRole.role_name }
      : typeof nestedRole === 'string'
        ? nestedRole
        : null;

  return {
    public_id: String(profileUser.public_id ?? data.public_id ?? ''),
    username: String(profileUser.username ?? claims.username ?? ''),
    email: String(data.email ?? profileUser.email ?? ''),
    first_name: String(data.first_name ?? profileUser.first_name ?? ''),
    last_name: String(data.last_name ?? profileUser.last_name ?? ''),
    role_name: roleName,
    role,
    is_superuser: Boolean(
      profileUser.is_superuser ??
        data.is_superuser ??
        claims.is_superuser,
    ),
    employee_public_id: hasEmployeeDetails
      ? String(data.public_id ?? '') || null
      : null,
    department_name: String(data.department_name ?? ''),
    job_title: String(data.job_title ?? ''),
    employment_status: String(data.employment_status ?? ''),
    hire_date: data.hire_date ? String(data.hire_date) : null,
    phone: data.phone ? String(data.phone) : null,
    manager: data.manager ? String(data.manager) : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const token = getAccessToken();

    if (!token) {
      setUser(null);
      return;
    }

    const claims = jwtDecode<JwtClaims>(token);

    const { data } = await api.get<Record<string, unknown>>(
      endpoints.profile,
    );

    setUser(normalizeProfile(data, claims));
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data } = await api.post<LoginResponse>(endpoints.login, {
        username,
        password,
      });

      if (!data.access || !data.refresh) {
        throw new Error(
          'The login endpoint did not return both JWT tokens.',
        );
      }

      setAccessToken(data.access);
      setRefreshToken(data.refresh);

      await fetchProfile();
    },
    [fetchProfile],
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        if (getAccessToken()) {
          await fetchProfile();
        } else {
          const refresh = getRefreshToken();

          if (refresh) {
            const { data } = await api.post<RefreshResponse>(
              endpoints.refresh,
              { refresh },
            );

            if (!data.access) {
              throw new Error(
                'The refresh endpoint did not return an access token.',
              );
            }

            setAccessToken(data.access);

            if (data.refresh) {
              setRefreshToken(data.refresh);
            }

            await fetchProfile();
          } else {
            setUser(null);
          }
        }
      } catch {
        clearTokens();

        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void initialize();

    const onExpired = () => {
      clearTokens();
      setUser(null);
    };

    window.addEventListener('erp:authentication-expired', onExpired);

    return () => {
      active = false;
      window.removeEventListener(
        'erp:authentication-expired',
        onExpired,
      );
    };
  }, [fetchProfile]);

  const hasRole = useCallback(
    (roles: string[]) =>
      !!user && (user.is_superuser || roles.includes(user.role_name)),
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, hasRole }),
    [user, loading, login, logout, hasRole],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
