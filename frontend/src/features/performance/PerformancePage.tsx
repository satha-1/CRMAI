// Manager's view of their own executives: are they doing the work, and what are the results?
//   Marketing manager → calls made, answer rate, hot / warm / cold, handed to sales, leads left uncalled.
//   Sales manager     → visits done, reports written, no-shows, deals won / lost.
// Plus a "needs attention" list and the latest call notes / visit reports so the manager can check the work itself.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCalls, useCustomers, usePerformance, useVisits } from '@/api/queries';
import type { ExecPerformance } from '@/api/types';
import { Avatar, Badge, Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { TempBadge } from '@/components/leadBits';
import { ago, callOutcomeLabel, pct, tempColor } from '@/lib/format';
import { ReportView } from '../visits/VisitPanel';

export function PerformancePage() {
  const { role } = useAuth();
  const sales = role === 'sales_manager';
  const { data, isLoading } = usePerformance();
  const rows = data?.items ?? [];
  const sum = (k: keyof ExecPerformance) => rows.reduce((s, r) => s + (r[k] as number), 0);

  const tiles = sales
    ? [['Visits today', sum('visits_today')], ['Late reports', sum('reports_pending')], ['Customer no-shows', sum('no_shows')], ['Deals won', sum('won')]]
    : [['Calls today', sum('calls_today')], ['Not called yet', sum('not_called')], ['Overdue callbacks', sum('overdue_callbacks')], ['Handed to sales', sum('handed_over')]];

  const attention: { who: string; text: string; to: string }[] = [];
  for (const r of rows) {
    if (sales) {
      if (r.reports_pending) attention.push({ who: r.full_name, text: `${r.reports_pending} visit report${r.reports_pending > 1 ? 's' : ''} not written after the visit time`, to: `/visits?tab=report&exec=${r.user_id}` });
      if (r.no_shows >= 2) attention.push({ who: r.full_name, text: `${r.no_shows} customers didn't come — confirm visits the day before`, to: `/visits?tab=done&exec=${r.user_id}` });
    } else {
      if (r.stale) attention.push({ who: r.full_name, text: `${r.stale} lead${r.stale > 1 ? 's' : ''} assigned over 24 h ago and still not called`, to: `/calls` });
      if (r.overdue_callbacks) attention.push({ who: r.full_name, text: `${r.overdue_callbacks} callback${r.overdue_callbacks > 1 ? 's' : ''} overdue`, to: `/calls` });
      if (r.calls >= 5 && r.answered_rate < 0.35) attention.push({ who: r.full_name, text: `Only ${pct(r.answered_rate)} of calls answered — try different times`, to: `/calls` });
    }
  }

  return (
    <div className="content">
      <PageHeader title={sales ? 'Sales team performance' : 'Marketing team performance'}
        sub={sales ? 'Visits, reports and results for the sales executives who report to you.' : 'Calls and results for the marketing executives who report to you.'} />
      {isLoading ? <Card><Loading /></Card> : !rows.length ? <Card><EmptyState title="No executives in your team" body="Ask the admin to set you as their manager on the Team page." /></Card> : (
        <>
          <div className="grid g-4">
            {tiles.map(([label, value]) => <div key={label as string} className="card card-pad"><div className="muted">{label}</div><div className="kpi-value">{value}</div></div>)}
          </div>

          <Card title={<div className="row"><AlertTriangle size={18} color="var(--amber)" /><h2>Needs attention</h2></div>}>
            {!attention.length ? <p className="row muted"><CheckCircle2 size={18} color="var(--green)" /> Everyone is up to date.</p> : (
              <ul className="attention">
                {attention.map((a, i) => <li key={i}><Avatar name={a.who} size="sm" /><span className="grow"><b>{a.who}</b> — {a.text}</span><Link className="small" to={a.to}>Check</Link></li>)}
              </ul>
            )}
          </Card>

          <Card pad={false} title={<h2>By executive</h2>}>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              {sales ? (
                <table className="table">
                  <thead><tr><th>Executive</th><th>Visits assigned</th><th>Today</th><th>Reports done</th><th>Late reports</th><th>No-shows</th><th>Negotiating</th><th>Won</th><th>Lost</th><th>Win rate</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.user_id}>
                      <td><Link to={`/visits?exec=${r.user_id}`} className="row"><Avatar name={r.full_name} size="sm" />{r.full_name}</Link></td>
                      <td>{r.visits_assigned}</td><td>{r.visits_today}</td><td>{r.visits_done}</td>
                      <td>{r.reports_pending ? <Badge tone="red">{r.reports_pending}</Badge> : 0}</td>
                      <td>{r.no_shows}</td><td>{r.negotiating}</td><td><b style={{ color: 'var(--green)' }}>{r.won}</b></td><td>{r.lost}</td>
                      <td>{r.won + r.lost ? pct(r.won / (r.won + r.lost)) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : (
                <table className="table">
                  <thead><tr><th>Executive</th><th>Leads</th><th>Not called</th><th>Calls (today)</th><th>Answered</th><th>Hot / warm / cold</th><th>Handed to sales</th><th>Overdue callbacks</th><th>Last call</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.user_id}>
                      <td><div className="row"><Avatar name={r.full_name} size="sm" />{r.full_name}</div></td>
                      <td>{r.assigned}</td>
                      <td>{r.stale ? <Badge tone="red">{r.not_called}</Badge> : r.not_called}</td>
                      <td>{r.calls} <span className="muted">({r.calls_today})</span></td>
                      <td>{r.calls ? pct(r.answered_rate) : '—'}</td>
                      <td className="nowrap"><span style={{ color: tempColor.hot }}>{r.hot}</span> / <span style={{ color: tempColor.warm }}>{r.warm}</span> / <span style={{ color: tempColor.cold }}>{r.cold}</span></td>
                      <td><b>{r.handed_over}</b></td>
                      <td>{r.overdue_callbacks ? <Badge tone="red">{r.overdue_callbacks}</Badge> : 0}</td>
                      <td className="nowrap">{r.last_call_at ? ago(r.last_call_at) : <span className="muted">never</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </Card>

          {sales ? <RecentReports /> : <RecentCalls />}
        </>
      )}
    </div>
  );
}

/** The actual call notes, so the manager can check the quality of each call, not just the count. */
function RecentCalls() {
  const { data } = useCalls();
  const { data: customers } = useCustomers();
  const cname = useMemo(() => new Map(customers?.items.map((c) => [c.id, c.full_name])), [customers]);
  const items = (data?.items ?? []).slice(0, 15);
  return (
    <Card pad={false} title={<h2>Latest calls</h2>}>
      {!items.length ? <EmptyState title="No calls yet" /> : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead><tr><th>When</th><th>Executive</th><th>Customer</th><th>Result</th><th>Notes</th></tr></thead>
            <tbody>{items.map((c) => (
              <tr key={c.id}>
                <td className="nowrap small">{ago(c.created_at)}</td>
                <td>{c.user_name}</td>
                <td><Link to={`/leads/${c.lead_id}`}>{cname.get(c.customer_id)}</Link></td>
                <td className="nowrap"><span className="row" style={{ gap: 4 }}>{callOutcomeLabel[c.outcome]}{c.temperature && <TempBadge t={c.temperature} />}{c.handed_over && <Badge tone="purple">To sales</Badge>}</span></td>
                <td className="small" style={{ maxWidth: 380 }}>{c.notes || <span className="muted">No notes</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RecentReports() {
  const { data } = useVisits({});
  const { data: customers } = useCustomers();
  const cname = useMemo(() => new Map(customers?.items.map((c) => [c.id, c.full_name])), [customers]);
  const items = (data?.items ?? []).filter((v) => ['completed', 'no_show'].includes(v.status)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, 8);
  return (
    <Card title={<h2>Latest visit reports</h2>}>
      {!items.length ? <p className="muted">No reports yet.</p> : items.map((v) => (
        <div key={v.id} style={{ marginBottom: 10 }}>
          <Link to={`/visits?tab=done&id=${v.id}`} className="strong small">{cname.get(v.customer_id)} · {v.location}</Link>
          <ReportView v={v} compact />
        </div>
      ))}
    </Card>
  );
}
