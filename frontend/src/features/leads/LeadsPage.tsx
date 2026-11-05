// Mockup 02 "Sales pipeline": board by lead status with drag-to-change-status, or a list view.
// LEAD MANAGEMENT (FRONTEND-ARCHITECTURE §11): status filter + status change via PATCH.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Calendar, Columns3, List, Plus, User } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCustomers, useLeads, useUpdateLead, useUsers } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Lead, LeadStatus } from '@/api/types';
import { Avatar, Badge, Card, EmptyState, Loading, PageHeader, Segmented, useToast } from '@/components/ui';
import { LEAD_STATUSES, dateShort, leadColor, leadLabel, leadTone, money } from '@/lib/format';
import { TempBadge } from '@/components/leadBits';
import { isExecutive } from '@/auth/permissions';
import { LeadFormModal } from './LeadForm';

const BOARD: LeadStatus[] = ['new', 'contacted', 'qualified', 'site_visit', 'negotiation', 'converted'];
const ALL: LeadStatus[] = LEAD_STATUSES;
const LABEL = leadLabel;
const COL_HELP: Partial<Record<LeadStatus, string>> = {
  new: 'Marketing · not called', contacted: 'Marketing · called', qualified: 'Sales · needs visit', site_visit: 'Sales · visit booked', negotiation: 'Sales · negotiating', converted: 'Won',
};

export function LeadsPage() {
  const { has, org, role } = useAuth();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useLeads({ assignee: owner || undefined });
  const { data: customers } = useCustomers();
  const { data: users } = useUsers();
  const update = useUpdateLead();
  const toast = useToast();
  const nav = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStatus | null>(null);

  const cname = useMemo(() => new Map(customers?.items.map((c) => [c.id, c.full_name])), [customers]);
  const uname = useMemo(() => new Map(users?.items.map((u) => [u.id, u.full_name])), [users]);
  const leads = (data?.items ?? []).filter((l) => !status || l.status === status);

  const move = (l: Lead, to: LeadStatus) => {
    if (l.status === to) return;
    if (to === 'converted' && !confirm(`Convert “${l.title}”? This records a conversion and purchase on the customer's timeline.`)) return;
    update.mutate({ id: l.id, status: to }, {
      onSuccess: () => toast(`${l.title} → ${LABEL[to]}`),
      onError: (e) => toast(errorMessage(e), true),
    });
  };

  return (
    <div className="content">
      <PageHeader title={isExecutive(role) ? 'My Leads' : 'Leads'} sub={`${leads.length} leads · ${money(leads.reduce((s, l) => s + (l.estimated_value ?? 0), 0))} estimated value`}
        actions={has('lead.write') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> New lead</button>} />
      <div className="row-between wrap">
        <div className="row wrap">
          <select className="select" style={{ width: 200 }} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
            <option value="">All owners</option>
            <option value="me">My leads</option>
            {users?.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          {view === 'list' && (
            <select className="select" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              {ALL.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
            </select>
          )}
        </div>
        <Segmented value={view} onChange={setView} options={[{ value: 'board', label: <><Columns3 />Board</> }, { value: 'list', label: <><List />List</> }]} />
      </div>

      {isLoading ? <Card><Loading /></Card> : view === 'board' ? (
        <div className="board">
          {BOARD.map((s) => {
            const col = leads.filter((l) => l.status === s);
            return (
              <div key={s} className={`column ${over === s ? 'drop' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }}
                onDragLeave={() => setOver(null)}
                onDrop={() => { const l = leads.find((x) => x.id === dragId); setOver(null); if (l) move(l, s); }}>
                <div>
                  <div className="col-head"><span className="col-dot" style={{ background: leadColor[s] }} />{LABEL[s]}<span className="count">{col.length}</span></div>
                  <div className="muted small" style={{ marginTop: 2 }}>{COL_HELP[s]} · {money(col.reduce((a, l) => a + (l.estimated_value ?? 0), 0))}</div>
                </div>
                {col.map((l) => (
                  <article key={l.id} className={`deal-card ${dragId === l.id ? 'dragging' : ''}`} draggable={has('lead.write')}
                    onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)}
                    onClick={() => nav(`/leads/${l.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/leads/${l.id}`)}>
                    <div className="row-between" style={{ alignItems: 'flex-start' }}>
                      <span className="strong" style={{ fontSize: 15.5 }}>{l.title}</span>
                      {l.estimated_value != null && <span className="money">{money(l.estimated_value)}</span>}
                    </div>
                    <span className="meta"><User />{cname.get(l.customer_id) ?? '—'}</span>
                    <span className="meta"><Calendar />Created {dateShort(l.created_at)}</span>
                    <div className="row-between" style={{ marginTop: 4 }}>
                      {l.assigned_user_id ? <span className="row small"><Avatar name={uname.get(l.assigned_user_id)} size="sm" />{uname.get(l.assigned_user_id)}</span> : <span className="muted small" style={{ color: 'var(--red)' }}>Unassigned</span>}
                      <span className="row" style={{ gap: 4 }}>{l.temperature && <TempBadge t={l.temperature} />}{l.created_actor_type === 'ai_agent' && <Badge tone="purple"><Bot size={12} />AI</Badge>}</span>
                    </div>
                  </article>
                ))}
                {!col.length && <p className="muted small" style={{ textAlign: 'center', padding: 20 }}>Drop leads here</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <Card pad={false}>
          {!leads.length ? <EmptyState title="No leads" body={`Leads appear when the AI captures interest in a ${org?.product_label}, or when staff add one.`} /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Lead</th><th>Customer</th><th>Stage</th><th>Temperature</th><th>Value</th><th>Marketing</th><th>Sales</th><th>Source</th><th>Created</th></tr></thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => nav(`/leads/${l.id}`)}>
                      <td><Link to={`/leads/${l.id}`} className="strong" onClick={(e) => e.stopPropagation()}>{l.title}</Link></td>
                      <td>{cname.get(l.customer_id)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {has('lead.write') ? (
                          <select className="select" style={{ height: 30, width: 140 }} value={l.status} onChange={(e) => move(l, e.target.value as LeadStatus)} aria-label="Lead status">
                            {ALL.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                          </select>
                        ) : <Badge tone={leadTone[l.status]}>{LABEL[l.status]}</Badge>}
                      </td>
                      <td><TempBadge t={l.temperature} empty="—" /></td>
                      <td>{money(l.estimated_value)}</td>
                      <td>{l.marketing_user_id ? uname.get(l.marketing_user_id) : <span className="muted">—</span>}</td>
                      <td>{l.sales_user_id ? uname.get(l.sales_user_id) : <span className="muted">—</span>}</td>
                      <td>{l.created_actor_type === 'ai_agent' ? <Badge tone="purple"><Bot size={12} />AI agent</Badge> : <Badge>Staff</Badge>}</td>
                      <td className="nowrap">{dateShort(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {creating && <LeadFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
