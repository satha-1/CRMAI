import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, session } from '@/api/client';
import type { LoginResponse, Me, Organization, Permission, Role } from '@/api/types';
import { permissionsFor } from './permissions';

interface AuthState {
  me: Me | null;
  /** Current workspace (company). */
  org: Organization | null;
  /** Role inside the current workspace — a person can be admin in one company and agent in another. */
  role: Role | null;
  loading: boolean;
  has: (p: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (b: { company_name: string; industry: string; full_name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (id: string) => void;
  createOrg: (name: string, industry: string) => Promise<Organization>;
  reloadMe: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [me, setMe] = useState<Me | null>(null);
  const [orgId, setOrgId] = useState<string | null>(session.organizationId());
  const [loading, setLoading] = useState(true);

  const reloadMe = useCallback(async () => {
    const m = await api.get<Me>('/auth/me');
    setMe(m);
    setOrgId((cur) => {
      const valid = m.memberships.some((x) => x.organization.id === cur) ? cur : m.memberships[0]?.organization.id ?? null;
      session.setOrganization(valid);
      return valid;
    });
  }, []);

  useEffect(() => {
    if (!session.refreshToken()) { setLoading(false); return; }
    reloadMe().catch(() => session.clear()).finally(() => setLoading(false));
  }, [reloadMe]);

  const membership = me?.memberships.find((m) => m.organization.id === orgId) ?? null;
  const role = membership?.role ?? null;
  // Permissions follow the role in the *current* workspace (server enforces the same; hiding is not the control).
  const perms = useMemo(() => new Set(role ? permissionsFor(role) : []), [role]);

  const value: AuthState = {
    me,
    org: membership?.organization ?? null,
    role,
    loading,
    has: (p) => perms.has(p),
    login: async (email, password) => {
      const t = await api.post<LoginResponse>('/auth/login', { email, password });
      session.setTokens(t);
      await reloadMe();
    },
    signup: async (b) => {
      const t = await api.post<LoginResponse & { organization_id: string }>('/auth/signup', b);
      session.setTokens(t);
      session.setOrganization(t.organization_id);
      setOrgId(t.organization_id);
      await reloadMe();
    },
    logout: async () => {
      try { await api.post('/auth/logout', { refresh_token: session.refreshToken() }); } catch { /* ignore */ }
      session.clear();
      session.setOrganization(null);
      setMe(null);
      qc.clear();
    },
    switchOrg: (id) => {
      session.setOrganization(id);
      setOrgId(id);
    },
    createOrg: async (name, industry) => {
      const org = await api.post<Organization>('/organizations', { name, industry });
      await reloadMe();
      session.setOrganization(org.id);
      setOrgId(org.id);
      return org;
    },
    reloadMe,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
