// "Your work today" strip at the top of the Overview, different for each of the 5 roles.
// Everything is computed from the leads the API already scopes to the signed-in user.
import { Link } from 'react-router-dom';
import { CalendarCheck, Flame, Handshake, MapPin, PhoneCall, PhoneMissed, Snowflake, Sun, Trophy, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useLeads, useVisits } from '@/api/queries';
import type { Lead, Role } from '@/api/types';
import { ROLE_LABEL } from '@/auth/permissions';
import { tempColor } from '@/lib/format';

type Tile = { label: string; value: number; to: string; icon: typeof Flame; color: string; hint: string };

export function RoleFocus() {
  const { role, me, has } = useAuth();
  const { data } = useLeads({});
  const { data: visits } = useVisits({ mine: role === 'sales_executive' }, has('visit.manage'));
  if (!role || !data) return null;
  const leads = data.items;
  const now = Date.now();
  const n = (f: (l: Lead) => boolean) => leads.filter(f).length;
  const marketingOpen = (l: Lead) => l.status === 'new' || l.status === 'contacted';
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const all = visits?.items ?? [];
  const active = all.filter((v) => ['scheduled', 'on_the_way', 'checked_in'].includes(v.status));
  const upcoming = active.filter((v) => new Date(v.scheduled_at).getTime() >= now);
  const visitsToday = all.filter((v) => v.status !== 'cancelled' && new Date(v.scheduled_at) >= sod && new Date(v.scheduled_at) <= today).length;
  const reportsDue = active.filter((v) => new Date(v.scheduled_at).getTime() < now).length;
  const requests = active.filter((v) => v.reschedule_reason).length;

  const tiles = build(role, me?.id ?? '', { n, marketingOpen, now, upcoming: upcoming.length, visitsToday, reportsDue, requests });
  return (
    <section className="card card-pad" aria-label="Your work">
      <div className="row-between wrap" style={{ marginBottom: 12 }}>
        <h2>Your work · {ROLE_LABEL[role]}</h2>
        <span className="muted small">{FLOW[role]}</span>
      </div>
      <div className="grid g-4" style={{ gap: 12 }}>
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="focus-tile">
            <span className="kpi-icon" style={{ background: `color-mix(in srgb, ${t.color} 12%, transparent)`, color: t.color }}><t.icon /></span>
            <span>
              <span className="kpi-value" style={{ fontSize: 26 }}>{t.value}</span>
              <span className="strong" style={{ display: 'block' }}>{t.label}</span>
              <span className="muted small">{t.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const FLOW: Record<Role, string> = {
  admin: 'You see both teams. New leads → marketing calls → sales visits → won.',
  marketing_manager: 'Give new leads to your executives, check their calls, read customer messages.',
  marketing_executive: 'Call your leads, mark them hot / warm / cold, hand hot & warm to sales.',
  sales_manager: 'Assign site visits for interested customers and check every visit report.',
  sales_executive: 'Go to your assigned visits, update the status, write what happened.',
};

function build(role: Role, me: string, x: { n: (f: (l: Lead) => boolean) => number; marketingOpen: (l: Lead) => boolean; now: number; upcoming: number; visitsToday: number; reportsDue: number; requests: number }): Tile[] {
  const { n, marketingOpen, now } = x;
  const due = (l: Lead) => marketingOpen(l) && !!l.next_call_at && new Date(l.next_call_at).getTime() <= now + 86400_000;
  const awaitingSales = (l: Lead) => l.status === 'qualified' && !l.sales_user_id;
  const unassignedNew = (l: Lead) => marketingOpen(l) && !l.marketing_user_id;
  const temp = (t: string) => (l: Lead) => marketingOpen(l) && l.temperature === t;
  switch (role) {
    case 'marketing_executive':
      return [
        { label: 'Not called yet', value: n((l) => l.status === 'new'), to: '/calls', icon: PhoneMissed, color: 'var(--primary)', hint: 'New leads given to you' },
        { label: 'Callbacks due', value: n(due), to: '/calls', icon: PhoneCall, color: 'var(--amber)', hint: 'Today or overdue' },
        { label: 'Hot leads', value: n(temp('hot')), to: '/calls', icon: Flame, color: tempColor.hot, hint: 'Ready to hand to sales' },
        { label: 'Handed to sales', value: n((l) => !!l.handed_over_at && l.marketing_user_id === me), to: '/leads', icon: Handshake, color: 'var(--purple)', hint: 'Your qualified leads' },
      ];
    case 'marketing_manager':
      return [
        { label: 'Waiting for a caller', value: n(unassignedNew), to: '/assign', icon: UserPlus, color: 'var(--red)', hint: 'Assign to an executive' },
        { label: 'Hot', value: n(temp('hot')), to: '/assign-calls', icon: Flame, color: tempColor.hot, hint: 'Being called' },
        { label: 'Warm', value: n(temp('warm')), to: '/assign-calls', icon: Sun, color: tempColor.warm, hint: 'Being called' },
        { label: 'Cold', value: n(temp('cold')), to: '/assign-calls', icon: Snowflake, color: tempColor.cold, hint: 'Nurture later' },
      ];
    case 'sales_manager':
      return [
        { label: 'Need a visit assigned', value: n((l) => l.status === 'qualified'), to: '/assign', icon: UserPlus, color: 'var(--red)', hint: 'Interested, from marketing' },
        { label: 'Visits today', value: x.visitsToday, to: '/visits', icon: MapPin, color: 'var(--primary)', hint: `${x.upcoming} still to happen` },
        { label: 'Late reports', value: x.reportsDue, to: '/visits?tab=report', icon: CalendarCheck, color: 'var(--amber)', hint: x.requests ? `${x.requests} asked for a new time` : 'Visit time passed, no report' },
        { label: 'Won', value: n((l) => l.status === 'converted'), to: '/performance', icon: Trophy, color: 'var(--green)', hint: `${n((l) => l.status === 'negotiation')} negotiating` },
      ];
    case 'sales_executive':
      return [
        { label: 'Visits today', value: x.visitsToday, to: '/visits', icon: MapPin, color: 'var(--primary)', hint: 'Check details before you go' },
        { label: 'Reports to write', value: x.reportsDue, to: '/visits?tab=report', icon: CalendarCheck, color: 'var(--red)', hint: 'Visit time has passed' },
        { label: 'Upcoming visits', value: x.upcoming, to: '/visits?tab=upcoming', icon: CalendarCheck, color: 'var(--teal)', hint: 'Assigned by your manager' },
        { label: 'Negotiating', value: n((l) => l.status === 'negotiation'), to: '/leads', icon: Handshake, color: 'var(--purple)', hint: `${n((l) => l.status === 'converted')} won so far` },
      ];
    default:
      return [
        { label: 'New, no caller', value: n(unassignedNew), to: '/assign', icon: UserPlus, color: 'var(--red)', hint: 'Marketing to assign' },
        { label: 'Hot leads', value: n(temp('hot')), to: '/calls', icon: Flame, color: tempColor.hot, hint: 'With marketing' },
        { label: 'Awaiting sales', value: n(awaitingSales), to: '/assign', icon: Users, color: 'var(--amber)', hint: 'Sales to assign' },
        { label: 'Site visits booked', value: x.upcoming, to: '/visits', icon: MapPin, color: 'var(--primary)', hint: `${x.visitsToday} today` },
      ];
  }
}
