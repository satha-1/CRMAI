// Mockup 01 "Sales overview" adapted to the MVP dashboard: four headline numbers (ANALYTICS.md),
// trend chart, leads by stage, AI summary, and "needs attention" (escalations + follow-ups due today).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bot, CalendarClock, ShieldAlert } from 'lucide-react';
import { RoleFocus } from './RoleFocus';
import { isExecutive } from '@/auth/permissions';
import { useAuth } from '@/auth/AuthProvider';
import { useCustomers, useDashboard, useEscalations, useFollowUps } from '@/api/queries';
import type { LeadStatus } from '@/api/types';
import { Avatar, Badge, Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { BarRows, Legend, LineChart, Sparkline } from '@/components/charts';
import { ago, dateTime, duration, isoDate, leadColor, leadLabel, pct, priorityTone, reasonLabel } from '@/lib/format';

export const RANGES = { 7: 'Last 7 days', 14: 'Last 14 days', 30: 'Last 30 days' } as const;
export type RangeKey = keyof typeof RANGES;

export function useRange(initial: RangeKey = 7) {
  const [days, setDays] = useState<RangeKey>(initial);
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400_000);
  return { days, setDays, from: isoDate(from), to: isoDate(to) };
}

export function RangeSelect({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <select className="select" style={{ width: 170 }} value={value} aria-label="Date range" onChange={(e) => onChange(Number(e.target.value) as RangeKey)}>
      {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function Kpi({ label, value, delta, good = true, spark, color }: { label: string; value: string; delta?: string; good?: boolean; spark: number[]; color: string }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <div className="kpi-row">
        <span className="kpi-value">{value}</span>
        {delta && (
          <span className={`delta ${good ? 'up' : 'down'}`} title="Second half of the range vs first half">
            {delta.startsWith('-') ? <ArrowDown size={13} /> : <ArrowUp size={13} />}{delta.replace(/^[-+]/, '')}
          </span>
        )}
      </div>
      <Sparkline data={spark} color={color} />
    </div>
  );
}

const STAGES: LeadStatus[] = ['new', 'contacted', 'qualified', 'site_visit', 'negotiation', 'converted', 'lost'];

export function DashboardPage() {
  const { org, role, me, has } = useAuth();
  const exec = isExecutive(role);
  const range = useRange(14);
  const { data: d, isLoading } = useDashboard(range.from, range.to, has('analytics.read'));
  const { data: esc } = useEscalations({ status: 'open,assigned,in_progress' }, has('escalation.read'));
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59);
  const { data: fu } = useFollowUps({ status: 'scheduled', due_before: endOfDay.toISOString(), assignee: exec ? 'me' : undefined });
  const { data: customers } = useCustomers();
  const nav = useNavigate();
  const cname = (id: string) => customers?.items.find((c) => c.id === id)?.full_name ?? '—';

  const half = (arr: number[]) => {
    const h = Math.floor(arr.length / 2);
    const a = arr.slice(0, h).reduce((s, v) => s + v, 0);
    const b = arr.slice(h).reduce((s, v) => s + v, 0);
    return a ? Math.round(((b - a) / a) * 100) : 0;
  };
  const daily = d?.daily ?? [];
  const leads = daily.map((x) => x.leads);
  const inbound = daily.map((x) => x.inbound);
  const escs = daily.map((x) => x.escalations);
  const escRate = daily.map((x) => (x.inbound ? x.escalations / x.inbound : 0));
  const labels = daily.map((x) => new Date(x.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const stageMax = Math.max(1, ...STAGES.map((s) => d?.leads_by_status[s] ?? 0));
  const stageTotal = STAGES.reduce((s, k) => s + (d?.leads_by_status[k] ?? 0), 0);
  const firstName = me?.full_name.split(' ')[0];

  return (
    <div className="content">
      <PageHeader
        title={exec ? 'My day' : 'Overview'}
        sub={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${firstName}. Here's what's happening at ${org?.name}.`}
        actions={has('analytics.read') && <RangeSelect value={range.days} onChange={range.setDays} />}
      />
      <RoleFocus />
      {!has('analytics.read') ? null : isLoading || !d ? <Card><Loading /></Card> : (
        <>
          <div className="grid g-4">
            <Kpi label="Leads created" value={String(d.leads_created)} delta={`${half(leads) >= 0 ? '+' : ''}${half(leads)}%`} good={half(leads) >= 0} spark={leads} color="#14a38b" />
            <Kpi label="Conversion rate" value={pct(d.conversion_rate)} spark={leads} color="#7c4dff" />
            <Kpi label="Escalation rate" value={pct(d.escalation_rate, 1)} delta={`${half(escs) > 0 ? '+' : '-'}${Math.abs(half(escs))}%`} good={half(escs) <= 0} spark={escRate} color="#e69a1c" />
            <Kpi label="Median first response" value={duration(d.median_first_response_seconds)} spark={inbound} color="#1d5bff" />
          </div>

          <div className="grid g-main-side">
            <Card title="Conversations & leads" actions={<Legend items={[{ name: 'Inbound messages', color: '#1d5bff' }, { name: 'Leads', color: '#14a38b', dashed: true }]} />}>
              <LineChart labels={labels} series={[
                { name: 'Inbound messages', values: inbound, color: '#1d5bff', area: true },
                { name: 'Leads', values: leads, color: '#14a38b', dashed: true },
              ]} />
            </Card>
            <Card title="Pipeline by stage" actions={<Link to="/leads" className="small">Open pipeline</Link>}>
              <BarRows rows={STAGES.map((s) => {
                const v = d.leads_by_status[s] ?? 0;
                return { label: leadLabel[s], value: v, max: stageMax, color: leadColor[s], display: `${v} (${stageTotal ? Math.round((v / stageTotal) * 100) : 0}%)` };
              })} />
            </Card>
          </div>

          {role === 'marketing_manager' && <section className="card card-pad" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="kpi-icon" style={{ background: 'var(--purple-50)', color: 'var(--purple)' }}><Bot /></span>
            <div className="grow" style={{ minWidth: 260 }}>
              <div className="row wrap"><h2>AI agent summary</h2><Badge tone="purple">{pct(Math.max(0, d.ai_resolution_rate))} AI handled without escalation</Badge></div>
              <p style={{ marginTop: 6, color: 'var(--text-2)' }}>
                In the selected period the AI agent handled {inbound.reduce((a, b) => a + b, 0)} inbound messages, created {d.leads_created} leads and
                handed {escs.reduce((a, b) => a + b, 0)} conversations to staff. Median AI turn latency was {(d.median_ai_latency_ms / 1000).toFixed(1)}s.
              </p>
              <p className="muted small" style={{ marginTop: 4 }}>“Handled without escalation” means the AI replied and nobody escalated — not that the customer was satisfied.</p>
            </div>
            <button className="btn btn-primary" onClick={() => nav('/performance')}>Team performance</button>
          </section>}
        </>
      )}

      <div className={has('escalation.read') ? 'grid g-2' : 'grid'}>
        {has('escalation.read') && <Card title={<div className="row"><ShieldAlert size={18} color="var(--red)" /><h2>Escalations needing attention</h2></div>} actions={<Link to="/escalations" className="small">Open queue</Link>} pad={false}>
          {!esc?.items.length ? <EmptyState title="Queue is clear" body="No active escalations." /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Customer</th><th>Reason</th><th>Priority</th><th>SLA</th></tr></thead>
                <tbody>
                  {esc.items.slice(0, 5).map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => nav(`/escalations?id=${e.id}`)}>
                      <td><div className="row"><Avatar name={e.customer_name} size="sm" /><Link to={`/escalations?id=${e.id}`} onClick={(x) => x.stopPropagation()}>{e.customer_name}</Link></div></td>
                      <td className="small">{reasonLabel[e.reason_code]}</td>
                      <td><Badge tone={priorityTone[e.priority]}>{e.priority}</Badge></td>
                      <td className="small nowrap" style={{ color: new Date(e.sla_due_at) < new Date() ? 'var(--red)' : undefined }}>{ago(e.sla_due_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>}
        <Card title={<div className="row"><CalendarClock size={18} color="var(--teal)" /><h2>{exec ? 'My follow-ups due today' : 'Follow-ups due today'}</h2></div>} actions={<Link to="/followups" className="small">All follow-ups</Link>} pad={false}>
          {!fu?.items.length ? <EmptyState title="Nothing due today" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Customer</th><th>Reason</th><th>When</th></tr></thead>
                <tbody>
                  {fu.items.slice(0, 5).map((f) => (
                    <tr key={f.id} className="clickable" onClick={() => nav(`/customers/${f.customer_id}`)}>
                      <td><div className="row"><Avatar name={cname(f.customer_id)} size="sm" />{cname(f.customer_id)}</div></td>
                      <td className="small">{f.reason}</td>
                      <td className="small nowrap" style={{ color: new Date(f.scheduled_at) < new Date() ? 'var(--red)' : undefined }}>{dateTime(f.scheduled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
