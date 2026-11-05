// Mockup 06 "Sales reports" + docs/features/ANALYTICS.md: date range, four numbers, channel bar,
// AI tool outcomes table, and (supervisors only) the staff table. No single "performance score".
import { BarChart3, Bot, Clock, MessageSquare, Target, Trophy } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useAgentStats, useDashboard } from '@/api/queries';
import type { ChannelCode, LeadStatus } from '@/api/types';
import { Avatar, Badge, Card, Loading, PageHeader } from '@/components/ui';
import { BarRows, Legend, LineChart } from '@/components/charts';
import { LEAD_STATUSES, channelName, duration, leadColor, leadLabel, leadTone, pct } from '@/lib/format';
import { isManager } from '@/auth/permissions';
import { RoleBadge } from '@/components/leadBits';
import { RangeSelect, useRange } from '../dashboard/DashboardPage';

export function AnalyticsPage() {
  const { role, org } = useAuth();
  const range = useRange(30);
  const { data: d, isLoading } = useDashboard(range.from, range.to);
  const supervisor = isManager(role);
  const { data: agents } = useAgentStats(range.from, range.to, supervisor);

  if (isLoading || !d) return <div className="content"><PageHeader title="Reports" /><Card><Loading /></Card></div>;
  const labels = d.daily.map((x) => new Date(x.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const channels = Object.entries(d.messages_by_channel) as [ChannelCode, number][];
  const chMax = Math.max(1, ...channels.map(([, v]) => v));
  const statuses: LeadStatus[] = LEAD_STATUSES;
  const total = statuses.reduce((s, k) => s + (d.leads_by_status[k] ?? 0), 0);

  return (
    <div className="content">
      <PageHeader title={supervisor ? 'Reports' : 'My activity'} sub={supervisor ? `Organization-wide metrics for ${org?.name}.` : 'Only conversations and leads assigned to you.'}
        actions={<RangeSelect value={range.days} onChange={range.setDays} />} />
      <div className="grid g-4">
        <Tile icon={<Target />} tone="teal" label="Leads created" value={String(d.leads_created)} />
        <Tile icon={<Trophy />} tone="purple" label="Conversion rate" value={pct(d.conversion_rate)} />
        <Tile icon={<BarChart3 />} tone="amber" label="Escalation rate" value={pct(d.escalation_rate, 1)} />
        <Tile icon={<Clock />} tone="blue" label="Median first response" value={duration(d.median_first_response_seconds)} />
      </div>

      <div className="grid g-main-side">
        <Card title="Daily trend" actions={<Legend items={[{ name: 'Leads', color: '#1d5bff' }, { name: 'Escalations', color: '#e69a1c', dashed: true }]} />}>
          <LineChart labels={labels} series={[
            { name: 'Leads', values: d.daily.map((x) => x.leads), color: '#1d5bff', area: true },
            { name: 'Escalations', values: d.daily.map((x) => x.escalations), color: '#e69a1c', dashed: true },
          ]} />
        </Card>
        <Card title="Messages by channel">
          <BarRows rows={channels.map(([k, v]) => ({ label: channelName[k], value: v, max: chMax, color: k === 'website' ? '#14a38b' : k === 'email' ? '#7c4dff' : '#cbd5e1', display: v ? String(v) : '0 · idle' }))} />
          <p className="muted small" style={{ marginTop: 10 }}>Channels without a live transport show zero. Simulated messages are excluded.</p>
        </Card>
      </div>

      <div className="grid g-2">
        <Card title={<div className="row"><Bot size={18} color="var(--purple)" /><h2>AI agent</h2></div>}>
          <div className="grid g-2" style={{ gap: 12, marginBottom: 14 }}>
            <MiniStat label="AI handled without escalation" value={pct(Math.max(0, d.ai_resolution_rate))} />
            <MiniStat label="Median AI latency" value={`${(d.median_ai_latency_ms / 1000).toFixed(1)}s`} />
            <MiniStat label="Follow-ups completed" value={String(d.followups_completed)} />
            <MiniStat label="Follow-ups missed" value={String(d.followups_missed)} />
          </div>
          <table className="table">
            <thead><tr><th>Tool</th><th>Outcome</th><th style={{ textAlign: 'right' }}>Calls</th></tr></thead>
            <tbody>
              {d.ai_actions_by_tool.map((t) => (
                <tr key={t.tool_name + t.tool_status}>
                  <td><code>{t.tool_name}</code></td>
                  <td><Badge tone={t.tool_status === 'success' ? 'green' : t.tool_status === 'denied' ? 'red' : 'gray'}>{t.tool_status}</Badge></td>
                  <td style={{ textAlign: 'right' }}>{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Pipeline performance" pad={false}>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Stage</th><th>Leads</th><th>Share</th><th style={{ width: '40%' }} /></tr></thead>
              <tbody>
                {statuses.map((s) => {
                  const v = d.leads_by_status[s] ?? 0;
                  return (
                    <tr key={s}>
                      <td><Badge tone={leadTone[s]}>{leadLabel[s]}</Badge></td>
                      <td>{v}</td>
                      <td>{total ? pct(v / total) : '—'}</td>
                      <td><div className="bar" style={{ height: 10 }}><span style={{ width: total ? `${(v / total) * 100}%` : 0, background: leadColor[s] }} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {supervisor && (
        <Card title={<div className="row"><MessageSquare size={18} /><h2>Staff activity</h2></div>} pad={false}>
          <p className="muted small" style={{ padding: '6px 20px 0' }}>For coaching, not ranking — there is deliberately no single performance score.</p>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead><tr><th>Staff</th><th>Role</th><th>Calls</th><th>Hot leads</th><th>Handed to sales</th><th>Site visits done</th><th>Conversions</th><th>Chat replies</th><th>Median takeover</th></tr></thead>
              <tbody>
                {agents?.items.map((a) => (
                  <tr key={a.user_id}>
                    <td><div className="row"><Avatar name={a.full_name} size="sm" />{a.full_name}</div></td>
                    <td><RoleBadge r={a.role} /></td><td>{a.calls}</td><td>{a.hot_leads}</td><td>{a.handed_over}</td><td>{a.visits_done}</td><td>{a.conversions}</td><td>{a.replies}</td><td>{duration(a.median_takeover_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="card card-pad row" style={{ gap: 14 }}>
      <span className="kpi-icon" style={{ background: `var(--${tone === 'blue' ? 'primary' : tone}-50)`, color: `var(--${tone === 'blue' ? 'primary' : tone})` }}>{icon}</span>
      <div><div className="muted">{label}</div><div className="kpi-value">{value}</div></div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div className="muted small">{label}</div><div className="strong" style={{ fontSize: 20 }}>{value}</div>
    </div>
  );
}
