import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../lib/apiClient';
import { setAccessToken } from '../../lib/tokenStore';
import type { LoginResponse, Profile } from '../../lib/types';

interface AuthContextValue {
  profile: Profile | null;
  isCheckingSession: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Al montar, intenta restaurar la sesion con la cookie de refresh: el
  // access token vive solo en memoria (ver lib/tokenStore.ts) y se pierde
  // al recargar la pagina a proposito.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `${(import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1'}/auth/refresh`,
          { method: 'POST', credentials: 'include' },
        );
        if (!response.ok) throw new Error('sin sesion previa');
        const data = (await response.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        const me = await api.get<Profile>('/me');
        if (!cancelled) setProfileState(me);
      } catch {
        setAccessToken(null);
        if (!cancelled) setProfileState(null);
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<LoginResponse>('/auth/login', { email, password });
    setAccessToken(response.accessToken);
    setProfileState(response.profile);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    } finally {
      setAccessToken(null);
      setProfileState(null);
    }
  }, []);

  const setProfile = useCallback((next: Profile) => setProfileState(next), []);

  return (
    <AuthContext.Provider value={{ profile, isCheckingSession, login, logout, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
