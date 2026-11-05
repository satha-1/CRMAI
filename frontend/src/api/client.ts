// docs/frontend/FRONTEND-ARCHITECTURE.md §5: attach bearer token, refresh once on AUTH_EXPIRED,
// throw a typed ApiError with code + message. Pages show `message`.
import type { ApiErrorBody, LoginResponse } from './types';

export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';
const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { field: string; issue: string }[],
  ) {
    super(message);
  }
}

// Access token lives in memory; refresh token in sessionStorage (prototype tradeoff, see SECURITY-DESIGN).
let accessToken: string | null = null;
let organizationId: string | null = safeGet('crmai.org');

function safeGet(k: string) {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string | null) {
  try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ignore */ }
}

export const session = {
  setTokens(t: Pick<LoginResponse, 'access_token' | 'refresh_token'>) {
    accessToken = t.access_token;
    safeSet('crmai.refresh', t.refresh_token);
  },
  clear() {
    accessToken = null;
    safeSet('crmai.refresh', null);
  },
  refreshToken: () => safeGet('crmai.refresh'),
  hasAccess: () => accessToken !== null,
  setOrganization(id: string | null) {
    organizationId = id;
    safeSet('crmai.org', id);
  },
  organizationId: () => organizationId,
};

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function raw<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (USE_MOCK) {
    // Loaded lazily so the mock never ships in a real-backend build.
    const { mockRequest } = await import('./mock/server');
    return mockRequest<T>(method, path, body, { token: accessToken, organizationId });
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (organizationId) headers['X-Organization-Id'] = organizationId;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => {
    // fetch only rejects when no response arrived, and its "Failed to fetch" message tells people nothing.
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'INTERNAL', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json as T;
}

let refreshing: Promise<void> | null = null;
async function refresh() {
  const rt = session.refreshToken();
  if (!rt) throw new ApiError(401, 'AUTH_INVALID', 'Please sign in');
  const t = await raw<LoginResponse>('POST', '/auth/refresh', { refresh_token: rt });
  session.setTokens(t);
}

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  // After a page reload the access token is gone but the refresh token survives in sessionStorage.
  const isTokenRoute = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/signup'].includes(path);
  if (!session.hasAccess() && session.refreshToken() && !isTokenRoute) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    await refreshing;
  }
  try {
    return await raw<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'AUTH_EXPIRED') {
      refreshing ??= refresh().finally(() => (refreshing = null));
      await refreshing;
      return raw<T>(method, path, body);
    }
    throw e;
  }
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
