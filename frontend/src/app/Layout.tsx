import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, BookOpen, Filter, Home, Inbox, LogOut, MapPin, Menu, PhoneCall, Settings, UserPlus, Users, UsersRound, ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { USE_MOCK } from '@/api/client';
import { useEscalations } from '@/api/queries';
import type { Role } from '@/api/types';
import { ROLE_LABEL } from '@/auth/permissions';
import { Avatar } from '@/components/ui';
import { NotificationBell } from '@/components/NotificationBell';


type Item = { to: string; label: string; icon: typeof Home; end?: boolean };
const overview: Item = { to: '/', label: 'Overview', icon: Home, end: true };
const customers: Item = { to: '/customers', label: 'Customers', icon: UsersRound };
// Each role gets only the pages it works with.
const NAV: Record<Role, Item[]> = {
  admin: [
    { to: '/users', label: 'Team & roles', icon: Users },
    { to: '/settings', label: 'Workspace settings', icon: Settings },
  ],
  marketing_manager: [
    overview,
    { to: '/assign', label: 'Assign leads', icon: UserPlus },
    { to: '/assign-calls', label: 'Assign calls', icon: PhoneCall },
    { to: '/performance', label: 'Team performance', icon: BarChart3 },
    { to: '/inbox', label: 'Customer messages', icon: Inbox },
    customers,
    { to: '/knowledge', label: 'AI knowledge', icon: BookOpen },
  ],
  marketing_executive: [
    overview,
    { to: '/calls', label: 'My calls', icon: PhoneCall },
    { to: '/leads', label: 'My leads', icon: Filter },
    customers,
  ],
  sales_manager: [
    overview,
    { to: '/assign', label: 'Assign visits', icon: UserPlus },
    { to: '/visits', label: 'Team visits', icon: MapPin },
    { to: '/performance', label: 'Team performance', icon: BarChart3 },
    customers,
  ],
  sales_executive: [
    overview,
    { to: '/visits', label: 'My visits', icon: MapPin },
    { to: '/leads', label: 'My deals', icon: Filter },
    customers,
  ],
};

export function Layout() {
  const { me, org, role, has, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const { data: esc } = useEscalations({ status: 'open' }, has('escalation.read'));
  const openEsc = esc?.items.length ?? 0;

  const link = (i: Item) => (
    <NavLink key={i.to} to={i.to} end={i.end}>
      <i.icon aria-hidden />
      {i.label}
      {i.to === '/escalations' && openEsc > 0 && <span className="count" aria-label={`${openEsc} open`}>{openEsc}</span>}
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand"><img src="/logo.svg" alt="" />CRMAI</div>
        <nav className="nav">
          {(role ? NAV[role] : []).map(link)}
        </nav>
        <div className="sidebar-foot">
          {org && role === 'marketing_manager' && (
            <a className="btn btn-sm" href={`/widget.html?key=${org.widget_key}`} target="_blank" rel="noreferrer">
              <ExternalLink /> Open customer chat
            </a>
          )}
          <div className="row" style={{ padding: '8px 4px' }}>
            <Avatar name={me?.full_name} size="sm" />
            <div className="grow">
              <div className="strong small ellipsis">{me?.full_name}</div>
              <div className="muted small">{role && ROLE_LABEL[role]}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut /></button>
          </div>
        </div>
      </aside>
      {open && <div className="overlay" style={{ zIndex: 55 }} onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="btn btn-icon mobile-only" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <div className="row">
            {USE_MOCK && <span className="badge b-amber" title="Running against the in-browser mock API (VITE_USE_MOCK=true)">Mock API</span>}
            <NotificationBell />
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
