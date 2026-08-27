import { getAccessToken, setAccessToken } from './tokenStore';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

interface ErrorPayload {
  error?: { code?: string; message?: string; correlationId?: string };
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Un solo refresh en vuelo aunque varias peticiones expiren a la vez: sin
 * esto, cinco componentes pidiendo datos al mismo tiempo dispararian cinco
 * rotaciones de refresh token, y solo la primera en llegar al backend
 * ganaria (las demas verian su token ya revocado).
 */
async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        setAccessToken(null);
        return false;
      }
      const data = (await response.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include', // manda la cookie de refresh en cada llamada, la usa /auth/refresh
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  // Un 401 en cualquier ruta protegida se intenta resolver UNA vez con
  // refresh antes de rendirse. /auth/* queda fuera para no reintentar un
  // login o un refresh que ya fallo por si mismo.
  if (response.status === 401 && !isRetry && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, true);
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as (T & ErrorPayload) | null;

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(response.status, error?.code ?? 'unknown', error?.message ?? response.statusText, error?.correlationId);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']): Promise<T> => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};
