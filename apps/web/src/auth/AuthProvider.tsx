import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthMe, DemoLoginInput, PasswordLoginInput, PermissionCode } from '@whoosh/shared';
import { apiRequest, ApiError, SESSION_EXPIRED_EVENT } from '../lib/api';

const AUTH_KEY = ['auth', 'me'] as const;

interface AuthContextValue {
  me: AuthMe | null;
  isLoading: boolean;
  isError: boolean;
  loginWithPassword: (input: DemoLoginInput) => Promise<AuthMe>;
  loginWithEmail: (input: PasswordLoginInput) => Promise<AuthMe>;
  loginOidc: (returnTo?: string) => void;
  logout: () => Promise<void>;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
  hasPermission: (permission: PermissionCode) => boolean;
  isManagementUser: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const MANAGEMENT_ROLES = new Set([
  'SYSTEM_ADMIN',
  'DORMITORY_MANAGER',
  'DORMITORY_ADMIN',
  'FRONT_DESK',
  'HOUSEKEEPING',
  'MAINTENANCE',
  'AUDITOR',
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: AUTH_KEY,
    queryFn: async (): Promise<AuthMe | null> => {
      try {
        return await apiRequest<AuthMe>('/api/v1/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  const loginMutation = useMutation({
    mutationFn: (input: DemoLoginInput) =>
      apiRequest<AuthMe>('/api/v1/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (me) => {
      queryClient.setQueryData(AUTH_KEY, me);
    },
  });

  const emailLoginMutation = useMutation({
    mutationFn: (input: PasswordLoginInput) =>
      apiRequest<AuthMe>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (me) => {
      queryClient.setQueryData(AUTH_KEY, me);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest<{ loggedOut: boolean }>('/api/v1/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, null);
    },
  });

  const loginOidc = useCallback((returnTo = '/') => {
    window.location.assign(`/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const hasPermission = useCallback(
    (permission: PermissionCode) => meQuery.data?.permissions.includes(permission) ?? false,
    [meQuery.data],
  );

  const logout = useCallback(async () => {
    // onSettled clears local state, so a failed request must not block the redirect to /login.
    await logoutMutation.mutateAsync().catch(() => undefined);
  }, [logoutMutation.mutateAsync]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me: meQuery.data ?? null,
      isLoading: meQuery.isLoading,
      isError: meQuery.isError,
      loginWithPassword: loginMutation.mutateAsync,
      loginWithEmail: emailLoginMutation.mutateAsync,
      loginOidc,
      logout,
      isLoggingIn: loginMutation.isPending || emailLoginMutation.isPending,
      isLoggingOut: logoutMutation.isPending,
      hasPermission,
      isManagementUser:
        meQuery.data?.roles.some((role) => MANAGEMENT_ROLES.has(role.roleCode)) ?? false,
    }),
    [
      meQuery.data,
      meQuery.isLoading,
      meQuery.isError,
      loginMutation.mutateAsync,
      loginMutation.isPending,
      emailLoginMutation.mutateAsync,
      emailLoginMutation.isPending,
      loginOidc,
      logout,
      logoutMutation.isPending,
      hasPermission,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function useIsDemoEnv(): boolean {
  const { me } = useAuth();
  return me?.session.authMode === 'mock';
}
