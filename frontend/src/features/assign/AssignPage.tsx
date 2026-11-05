// Managers assign leads to their executives.
//   Marketing manager: new leads (from AI chat / website / staff)  → marketing executives (calls)
//   Sales manager:     hot & warm leads handed over by marketing    → sales executives (site visits)
// Admin can switch between both teams.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { teamOf } from '@/auth/permissions';
import { useAssignLeads, useCustomers, useLeadsFor, useUsers, useWorkload } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Lead, Team, TeamMemberLoad } from '@/api/types';
import { Avatar, Card, EmptyState, Loading, PageHeader, useToast } from '@/components/ui';
import { StageBadge, TempBadge } from '@/components/leadBits';
import { ago, money, tempColor } from '@/lib/format';

const COPY: Record<Team, { title: string; sub: string; waiting: string; empty: string; exec: string }> = {
  marketing: {
    title: 'Assign leads',
    sub: 'New leads from website chat and staff. Give each one to one of your marketing executives with a time to call by.',
    waiting: 'New leads waiting for a caller',
    empty: 'Every new lead has a marketing executive.',
    exec: 'marketing executive',
  },
  sales: {
    title: 'Sales lead assignment',
    sub: 'Hot and warm leads handed over by marketing. Give each one to a sales executive for a site visit.',
    waiting: 'Handed over by marketing — needs a sales executive',
    empty: 'Every handed-over lead has a sales executive.',
    exec: 'sales executive',
  },
};

export function AssignPage() {
  const { role, has } = useAuth();
  const own = teamOf(role);
  const team: Team = own ?? 'marketing';
  const canAssign = has(team === 'sales' ? 'lead.assign.sales' : 'lead.assign.marketing');
  const copy = COPY[team];

  const { data: waiting, isLoading } = useLeadsFor({ unassigned: team });
  const { data: active } = useLeadsFor(team === 'marketing' ? { status: 'new,contacted', team } : { status: 'qualified,site_visit,negotiation', team });
  const { data: load } = useWorkload(team);
  const { data: customers } = useCustomers();
  const { data: users } = useUsers();
  const assign = useAssignLeads();
  const toast = useToast();
  const cmap = useMemo(() => new Map(customers?.items.map((c) => [c.id, c])), [customers]);
  const uname = (id: string | null) => users?.items.find((u) => u.id === id)?.full_name ?? '—';
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [callBy, setCallBy] = useState(() => { const d = new Date(Date.now() + 4 * 3600_000); d.setMinutes(0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const members = load?.items ?? [];
  const items = (waiting?.items ?? []).sort((a, b) => tempRank(a) - tempRank(b) || b.created_at.localeCompare(a.created_at));

  const doAssign = (ids: string[], user_id: string) => {
    if (!ids.length || !user_id) return;
    assign.mutate({ team, user_id, lead_ids: ids, call_by: team === 'marketing' && callBy ? new Date(callBy).toISOString() : null }, {
      onSuccess: (r) => { toast(`${r.assigned} lead${r.assigned > 1 ? 's' : ''} assigned to ${uname(user_id)}`); setPicked(new Set()); },
      onError: (e) => toast(errorMessage(e), true),
    });
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = items.length > 0 && items.every((l) => picked.has(l.id));

  return (
    <div className="content">
      <PageHeader title={copy.title} sub={copy.sub}
 />

      <div className="flow-strip" aria-label="Lead flow">
        <span className="step">New lead</span><ArrowRight size={14} />
        <span className={`step ${team === 'marketing' ? 'on' : ''}`}>Marketing manager assigns</span><ArrowRight size={14} />
        <span className="step">Marketing exec calls · hot / warm / cold</span><ArrowRight size={14} />
        <span className={`step ${team === 'sales' ? 'on' : ''}`}>Sales manager assigns</span><ArrowRight size={14} />
        <span className="step">Sales exec site visit</span><ArrowRight size={14} />
        <span className="step">Converted</span>
      </div>

      <Card title={<div className="row"><Users size={18} /><h2>Team workload</h2></div>}>
        {!members.length ? <p className="muted">No {copy.exec}s in this workspace yet. Add them under Team.</p> : (
          <div className="grid g-3" style={{ gap: 12 }}>
            {members.map((m) => <MemberCard key={m.user_id} m={m} team={team} on={target === m.user_id} onPick={() => setTarget(target === m.user_id ? '' : m.user_id)} />)}
          </div>
        )}
      </Card>

      <Card pad={false} title={<h2>{copy.waiting} <span className="muted" style={{ fontWeight: 500 }}>({items.length})</span></h2>}>
        {canAssign && items.length > 0 && (
          <div className="row wrap" style={{ padding: '12px 20px 0', gap: 10 }}>
            <span className="muted small">{picked.size ? `${picked.size} selected` : 'Select leads, pick a person, assign'}</span>
            <select className="select" style={{ width: 240 }} value={target} onChange={(e) => setTarget(e.target.value)} aria-label={`Assign to ${copy.exec}`}>
              <option value="">Choose a {copy.exec}…</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name} ({m.open_leads} open)</option>)}
            </select>
            {team === 'marketing' && (
              <label className="row small" style={{ gap: 6 }}><span className="muted">Call by</span>
                <input className="input" style={{ height: 36, width: 200 }} type="datetime-local" value={callBy} onChange={(e) => setCallBy(e.target.value)} aria-label="Call by" />
              </label>
            )}
            <button className="btn btn-primary" disabled={!picked.size || !target || assign.isPending} onClick={() => doAssign([...picked], target)}>
              <UserPlus /> Assign {picked.size || ''}
            </button>
          </div>
        )}
        {isLoading ? <Loading /> : !items.length ? <EmptyState icon={<CheckCircle2 />} title="All caught up" body={copy.empty} /> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr>
                {canAssign && <th style={{ width: 40 }}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(items.map((l) => l.id)))} /></th>}
                <th>Customer</th><th>Lead</th>{team === 'sales' && <th>Temperature</th>}<th>Value</th><th>{team === 'sales' ? 'Called by' : 'Source'}</th><th>{team === 'sales' ? 'Handed over' : 'Created'}</th>{canAssign && <th>Quick assign</th>}
              </tr></thead>
              <tbody>
                {items.map((l) => {
                  const c = cmap.get(l.customer_id);
                  return (
                    <tr key={l.id} className={picked.has(l.id) ? 'selected' : ''}>
                      {canAssign && <td><input type="checkbox" aria-label={`Select ${c?.full_name}`} checked={picked.has(l.id)} onChange={() => toggle(l.id)} /></td>}
                      <td><div className="row"><Avatar name={c?.full_name} size="sm" /><div><div className="strong">{c?.full_name}</div><div className="muted small">{c?.primary_phone}</div></div></div></td>
                      <td><Link to={`/leads/${l.id}`}>{l.title}</Link></td>
                      {team === 'sales' && <td><TempBadge t={l.temperature} /></td>}
                      <td>{money(l.estimated_value)}</td>
                      <td>{team === 'sales' ? uname(l.marketing_user_id) : l.created_actor_type === 'ai_agent' ? 'AI chat' : 'Staff'}</td>
                      <td className="nowrap">{ago(team === 'sales' ? l.handed_over_at ?? l.updated_at : l.created_at)}</td>
                      {canAssign && (
                        <td>
                          <select className="select" style={{ height: 32, width: 170 }} value="" onChange={(e) => doAssign([l.id], e.target.value)} aria-label={`Assign ${c?.full_name}`}>
                            <option value="">Assign to…</option>
                            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card pad={false} title={<h2>Currently with the {team} team</h2>}>
        {!active?.items.length ? <EmptyState title="Nothing in progress" /> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Customer</th><th>Lead</th><th>Stage</th><th>Temperature</th><th>{team === 'marketing' ? 'Calls' : 'Value'}</th><th>Assigned to</th>{canAssign && <th>Reassign</th>}</tr></thead>
              <tbody>
                {active.items.map((l) => {
                  const owner = team === 'marketing' ? l.marketing_user_id : l.sales_user_id;
                  return (
                    <tr key={l.id}>
                      <td><div className="row"><Avatar name={cmap.get(l.customer_id)?.full_name} size="sm" />{cmap.get(l.customer_id)?.full_name}</div></td>
                      <td><Link to={`/leads/${l.id}`}>{l.title}</Link></td>
                      <td><StageBadge s={l.status} /></td>
                      <td><TempBadge t={l.temperature} empty="—" /></td>
                      <td>{team === 'marketing' ? l.call_count : money(l.estimated_value)}</td>
                      <td>{uname(owner)}</td>
                      {canAssign && (
                        <td>
                          <select className="select" style={{ height: 32, width: 170 }} value={owner ?? ''} onChange={(e) => doAssign([l.id], e.target.value)} aria-label="Reassign">
                            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const tempRank = (l: Lead) => (l.temperature === 'hot' ? 0 : l.temperature === 'warm' ? 1 : l.temperature === 'cold' ? 2 : 3);

function MemberCard({ m, team, on, onPick }: { m: TeamMemberLoad; team: Team; on: boolean; onPick: () => void }) {
  const total = Math.max(1, m.hot + m.warm + m.cold);
  return (
    <button className={`member-card ${on ? 'on' : ''}`} onClick={onPick} aria-pressed={on} title="Click to pick as the assignee">
      <div className="row"><Avatar name={m.full_name} /><div className="grow"><div className="strong">{m.full_name}</div><div className="muted small">{m.open_leads} open leads</div></div></div>
      {team === 'marketing' ? (
        <>
          <div className="load-bar" aria-hidden>
            <span style={{ width: `${(m.hot / total) * 100}%`, background: tempColor.hot }} />
            <span style={{ width: `${(m.warm / total) * 100}%`, background: tempColor.warm }} />
            <span style={{ width: `${(m.cold / total) * 100}%`, background: tempColor.cold }} />
          </div>
          <div className="row small" style={{ gap: 12 }}>
            <span style={{ color: tempColor.hot }}>● {m.hot} hot</span><span style={{ color: tempColor.warm }}>● {m.warm} warm</span><span style={{ color: tempColor.cold }}>● {m.cold} cold</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>{m.callbacks_due} callbacks</span>
          </div>
        </>
      ) : (
        <div className="row small" style={{ gap: 12 }}>
          <span><b>{m.visits_upcoming}</b> <span className="muted">visits booked</span></span>
          <span><b>{m.visits_done}</b> <span className="muted">done</span></span>
          <span><b style={{ color: 'var(--green)' }}>{m.converted}</b> <span className="muted">won</span></span>
        </div>
      )}
    </button>
  );
}
