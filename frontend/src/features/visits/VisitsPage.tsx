// Site visits.
//   Sales executive → "My visits": today's agenda first, then upcoming, reports to write, done.
//   Sales manager   → "Team visits": every executive's day, late reports, reschedule requests.
// Visits are assigned by the sales manager on /assign; executives don't book their own.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, MapPin } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCustomers, useLeads, useUsers, useVisits } from '@/api/queries';
import type { SiteVisit } from '@/api/types';
import { Avatar, Badge, Card, EmptyState, Loading, PageHeader, Tabs } from '@/components/ui';
import { TempBadge } from '@/components/leadBits';
import { timeOnly, visitStatusLabel, visitStatusTone } from '@/lib/format';
import { VisitPanel, isActive, isLate, whenText } from './VisitPanel';

type Tab = 'today' | 'upcoming' | 'report' | 'requests' | 'done';

export function VisitsPage() {
  const { role, me } = useAuth();
  const manager = role === 'sales_manager';
  const [params, setParams] = useSearchParams();
  const [exec, setExec] = useState(params.get('exec') ?? '');
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'today');
  const [selId, setSelId] = useState<string | null>(params.get('id'));
  const { data: visitsData, isLoading } = useVisits({ mine: !manager });
  const { data: leadsData } = useLeads({});
  const { data: customers } = useCustomers();
  const { data: users } = useUsers();
  const cmap = useMemo(() => new Map(customers?.items.map((c) => [c.id, c])), [customers]);
  const lmap = useMemo(() => new Map(leadsData?.items.map((l) => [l.id, l])), [leadsData]);
  const execs = (users?.items ?? []).filter((u) => u.role === 'sales_executive' && u.is_active && (!u.manager_id || u.manager_id === me?.id));

  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  const all = (visitsData?.items ?? []).filter((v) => !exec || v.user_id === exec);
  const at = (v: SiteVisit) => new Date(v.scheduled_at);
  const groups: Record<Tab, SiteVisit[]> = {
    today: all.filter((v) => at(v) >= sod && at(v) <= eod && v.status !== 'cancelled'),
    upcoming: all.filter((v) => isActive(v) && at(v) > eod),
    report: all.filter(isLate),
    requests: all.filter((v) => isActive(v) && v.reschedule_reason),
    done: all.filter((v) => !isActive(v)).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
  };
  const list = groups[tab];
  const current = list.find((v) => v.id === selId) ?? all.find((v) => v.id === selId) ?? list[0];

  const tabs: { value: Tab; label: string }[] = [
    { value: 'today', label: `Today (${groups.today.length})` },
    { value: 'upcoming', label: `Upcoming (${groups.upcoming.length})` },
    { value: 'report', label: `${manager ? 'Late reports' : 'Write report'} (${groups.report.length})` },
    ...(manager ? [{ value: 'requests' as Tab, label: `New time asked (${groups.requests.length})` }] : []),
    { value: 'done', label: `Done (${groups.done.length})` },
  ];
  const pick = (t: Tab) => { setTab(t); setSelId(null); setParams({}, { replace: true }); };

  return (
    <div className="content">
      <PageHeader
        title={manager ? 'Team site visits' : 'My site visits'}
        sub={manager ? 'Where your sales executives are today, and what happened at each visit.' : `${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} — check the details, go to the site, write what happened.`}
        actions={manager && (
          <select className="select" style={{ width: 220 }} value={exec} onChange={(e) => setExec(e.target.value)} aria-label="Sales executive">
            <option value="">All sales executives</option>
            {execs.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        )}
      />

      {manager && <TeamToday visits={(visitsData?.items ?? []).filter((v) => at(v) >= sod && at(v) <= eod && v.status !== 'cancelled')} execs={execs} cname={(id) => cmap.get(id)?.full_name ?? '—'} onPick={(v) => { setTab('today'); setSelId(v.id); }} />}

      <Tabs value={tab} onChange={pick} options={tabs} />

      {isLoading ? <Card><Loading /></Card> : (
        <div className="grid g-side-main" style={{ alignItems: 'start' }}>
          <section className="card card-pad stack-sm" aria-label="Visits">
            {!list.length ? (
              <EmptyState icon={<CalendarCheck />} title={tab === 'today' ? 'No visits today' : 'Nothing here'}
                body={tab === 'today' && !manager ? 'Your sales manager assigns visits. New ones show up here and in your notifications.' : undefined} />
            ) : list.map((v) => {
              const c = cmap.get(v.customer_id);
              const l = lmap.get(v.lead_id);
              return (
                <button key={v.id} className={`list-item visit-item ${current?.id === v.id ? 'selected' : ''}`} onClick={() => setSelId(v.id)}>
                  <div className="visit-time"><b>{timeOnly(v.scheduled_at)}</b><span className="muted small">{tab === 'today' ? whenText(v) : new Date(v.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row-between"><span className="strong ellipsis">{c?.full_name}</span>{l?.temperature && <TempBadge t={l.temperature} />}</div>
                    <div className="muted small ellipsis"><MapPin size={12} style={{ verticalAlign: -2 }} /> {v.location}</div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                      <Badge tone={isLate(v) ? 'red' : visitStatusTone[v.status]} dot>{isLate(v) ? 'Report due' : visitStatusLabel[v.status]}</Badge>
                      {v.reschedule_reason && isActive(v) && <Badge tone="amber">New time asked</Badge>}
                      {manager && <span className="muted small">{v.user_name}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
          {current
            ? <VisitPanel key={current.id} visit={current} lead={lmap.get(current.lead_id)} customer={cmap.get(current.customer_id)} mode={manager ? 'manager' : 'exec'} />
            : <section className="card"><EmptyState title="Pick a visit" /></section>}
        </div>
      )}
    </div>
  );
}

/** Manager's at-a-glance strip: each executive's visits today, coloured by status. */
function TeamToday({ visits, execs, cname, onPick }: { visits: SiteVisit[]; execs: { id: string; full_name: string }[]; cname: (id: string) => string; onPick: (v: SiteVisit) => void }) {
  if (!execs.length) return null;
  return (
    <Card title={<h2>Today by executive</h2>}>
      <div className="grid g-3" style={{ gap: 12 }}>
        {execs.map((u) => {
          const mine = visits.filter((v) => v.user_id === u.id).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
          const doneN = mine.filter((v) => v.status === 'completed').length;
          return (
            <div key={u.id} className="member-card" style={{ cursor: 'default' }}>
              <div className="row"><Avatar name={u.full_name} /><div className="grow"><div className="strong">{u.full_name}</div><div className="muted small">{mine.length} visits · {doneN} reported</div></div></div>
              {!mine.length ? <span className="muted small">Free today</span> : mine.map((v) => (
                <button key={v.id} className="day-slot" onClick={() => onPick(v)}>
                  <b>{timeOnly(v.scheduled_at)}</b><span className="ellipsis grow">{cname(v.customer_id)}</span>
                  <Badge tone={isLate(v) ? 'red' : visitStatusTone[v.status]}>{isLate(v) ? 'Report due' : visitStatusLabel[v.status]}</Badge>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
