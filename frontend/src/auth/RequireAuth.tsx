import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { Permission } from '@/api/types';
import { EmptyState } from '@/components/ui';
import { ShieldOff } from 'lucide-react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="boot">Loading…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

/** Route-level permission gate. The API still returns 403 — this only avoids showing a broken page. */
export function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { has } = useAuth();
  if (!has(perm)) {
    return <EmptyState icon={<ShieldOff />} title="You don't have access to this page" body={`Ask a workspace admin for the “${perm}” permission.`} />;
  }
  return <>{children}</>;
}
