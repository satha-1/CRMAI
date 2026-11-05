// Mockup 07 "Deal details": hero, breadcrumb, key facts row, details, activity timeline, AI panel.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bot, Calendar, CalendarPlus, CheckCircle2, MapPin, MessageSquare, Pencil, PhoneCall, Trash2, User, XCircle } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useAssignLeads, useConversations, useCustomer, useDeleteLead, useFollowUps, useLead, useLeadCalls, useLeadVisits, useTimeline, useUpdateLead, useUsers } from '@/api/queries';
import { TempBadge, StageBadge } from '@/components/leadBits';
import type { Team } from '@/api/types';
import { errorMessage } from '@/api/client';
import type { LeadStatus } from '@/api/types';
import { Badge, Card, EmptyState, Loading, useToast } from '@/components/ui';
import { Timeline } from '@/components/Timeline';
import { LEAD_STATUSES, callOutcomeLabel, channelName, dateShort, dateTime, followTone, humanize, leadLabel, money, visitOutcomeLabel, visitStatusTone } from '@/lib/format';
import { LeadFormModal } from './LeadForm';
import { FollowUpModal } from '../followups/FollowUpsPage';

export function LeadDetailPage() {
  const { id } = useParams();
  const { has, org } = useAuth();
  const { data: lead, isLoading, error } = useLead(id);
  const { data: customer } = useCustomer(lead?.customer_id);
  const { data: timeline } = useTimeline(lead?.customer_id);
  const { data: fus } = useFollowUps({ customer_id: lead?.customer_id });
  const { data: convs } = useConversations({ customer_id: lead?.customer_id });
  const { data: users } = useUsers();
  const { data: calls } = useLeadCalls(id);
  const { data: visits } = useLeadVisits(id);
  const assign = useAssignLeads();
  const update = useUpdateLead();
  const del = useDeleteLead();
  const toast = useToast();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  if (isLoading) return <div className="content"><Card><Loading /></Card></div>;
  if (error || !lead) return <div className="content"><EmptyState title="Lead not found" body={errorMessage(error)} /></div>;

  const uname = (uid: string | null) => users?.items.find((u) => u.id === uid)?.full_name;
  const reassign = (team: Team, user_id: string) => user_id && assign.mutate({ team, user_id, lead_ids: [lead.id] }, {
    onSuccess: () => toast(`Assigned to ${uname(user_id)}`), onError: (e) => toast(errorMessage(e), true),
  });
  const handedOver = !['new', 'contacted', 'unqualified'].includes(lead.status) || !!lead.handed_over_at;
  const setStatus = (s: LeadStatus) => {
    if (s === 'converted' && !confirm('Convert this lead? Staff confirm the win; this writes conversion and purchase events.')) return;
    update.mutate({ id: lead.id, status: s }, { onSuccess: () => toast(`Marked ${s}`), onError: (e) => toast(errorMessage(e), true) });
  };
  const leadEvents = (timeline?.items ?? []).filter((t) => !t.lead_id || t.lead_id === lead.id);
  const leadFus = (fus?.items ?? []).filter((f) => !f.lead_id || f.lead_id === lead.id);
  const closed = lead.status === 'converted' || lead.status === 'lost';

  return (
    <div className="content">
      <div className="hero">
        <span className="muted small" style={{ color: 'rgba(255,255,255,.8)', position: 'relative', zIndex: 1 }}>{org?.name} · {humanize(org?.product_label ?? '')}</span>
        <span style={{ fontSize: 26, fontWeight: 800, position: 'relative', zIndex: 1 }}>{lead.product_name ?? lead.title}</span>
      </div>
      <nav className="small" aria-label="Breadcrumb"><Link to="/leads">Pipeline</Link> <span className="muted">/ {lead.title}</span></nav>
      <div className="page-head">
        <div className="row wrap"><h1>{lead.title}</h1><StageBadge s={lead.status} /><TempBadge t={lead.temperature} /></div>
        {has('lead.write') && (
          <div className="row wrap">
            {!closed && <button className="btn" onClick={() => setStatus('lost')}><XCircle /> Mark lost</button>}
            {!closed && has('customer.write') && <button className="btn btn-outline-primary" onClick={() => setStatus('converted')}><CheckCircle2 /> Convert</button>}
            {has('lead.delete') && lead.status === 'new' && (
              <button className="btn btn-ghost" aria-label="Delete lead" onClick={() => confirm('Delete this lead?') && del.mutate(lead.id, { onSuccess: () => { toast('Lead deleted'); nav('/leads'); }, onError: (e) => toast(errorMessage(e), true) })}><Trash2 /></button>
            )}
            <button className="btn btn-primary" onClick={() => setEditing(true)}><Pencil /> Edit lead</button>
          </div>
        )}
      </div>

      <div className="grid g-main-side" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="row wrap" style={{ padding: '16px 20px', gap: 0, borderBottom: '1px solid var(--border)' }}>
            <Fact label="Estimated value"><span style={{ fontSize: 24, fontWeight: 800 }}>{money(lead.estimated_value)}</span></Fact>
            <Fact label="Customer"><Link to={`/customers/${lead.customer_id}`} className="row strong"><User size={16} />{customer?.full_name}</Link></Fact>
            <Fact label="Temperature"><TempBadge t={lead.temperature} /></Fact>
            <Fact label="Created"><span className="row"><Calendar size={16} className="muted" />{dateShort(lead.created_at)}</span></Fact>
            <Fact label="Stage" last>
              {has('lead.write') ? (
                <select className="select" style={{ height: 32 }} value={lead.status} onChange={(e) => setStatus(e.target.value as LeadStatus)} aria-label="Stage">
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{leadLabel[s]}</option>)}
                </select>
              ) : <StageBadge s={lead.status} />}
            </Fact>
          </div>
          <div className="card-body stack" style={{ gap: 18 }}>
            <h2>Lead details</h2>
            <div className="grid g-2" style={{ gap: 10 }}>
              <dl className="dl" style={{ gridTemplateColumns: '120px 1fr' }}>
                <dt>{humanize(org?.product_label ?? 'product')}</dt><dd>{lead.product_name ?? '—'}</dd>
                <dt>Company</dt><dd>{customer?.company_name ?? '—'}</dd>
                <dt>Email</dt><dd>{customer?.primary_email ?? '—'}</dd>
              </dl>
              <dl className="dl" style={{ gridTemplateColumns: '120px 1fr' }}>
                <dt>Source</dt><dd><Badge tone="teal">{channelName[lead.source_channel]}</Badge></dd>
                <dt>Created by</dt><dd>{lead.created_actor_type === 'ai_agent' ? <Badge tone="purple"><Bot size={12} />AI agent</Badge> : 'Staff'}</dd>
                <dt>Last updated</dt><dd>{dateShort(lead.updated_at)}</dd>
              </dl>
            </div>
            <div className="divider" />
            <h2>Activity timeline</h2>
            <Timeline items={leadEvents} />
          </div>
        </section>

        <div className="stack" style={{ gap: 18 }}>
          <Card title={<div className="row"><Bot size={20} color="var(--purple)" /><h2>Interest summary</h2></div>} actions={<span className="badge b-gray">Updated {dateShort(lead.updated_at)}</span>}>
            <p style={{ color: 'var(--text-2)' }}>{lead.interest_summary}</p>
            <p className="muted small" style={{ marginTop: 10 }}>Captured from the conversation. Value, conversion and pricing decisions stay with staff.</p>
            <div className="row wrap" style={{ marginTop: 14 }}>
              {convs?.items[0] && <Link className="btn btn-primary" to={`/inbox/${convs.items[0].id}`}><MessageSquare /> Open conversation</Link>}
              {has('followup.write') && !closed && <button className="btn btn-outline-primary" onClick={() => setScheduling(true)}><CalendarPlus /> Schedule follow-up</button>}
            </div>
          </Card>
          <Card title="Team on this lead">
            <dl className="dl" style={{ gridTemplateColumns: '130px 1fr' }}>
              <dt><PhoneCall />Marketing</dt>
              <dd>{has('lead.assign.marketing') && !handedOver ? (
                <select className="select" style={{ height: 32 }} value={lead.marketing_user_id ?? ''} onChange={(e) => reassign('marketing', e.target.value)} aria-label="Marketing executive">
                  <option value="">Not assigned</option>
                  {users?.items.filter((u) => u.role === 'marketing_executive').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              ) : uname(lead.marketing_user_id) ?? <span className="muted">Not assigned</span>}</dd>
              <dt><MapPin />Sales</dt>
              <dd>{has('lead.assign.sales') && handedOver ? (
                <select className="select" style={{ height: 32 }} value={lead.sales_user_id ?? ''} onChange={(e) => reassign('sales', e.target.value)} aria-label="Sales executive">
                  <option value="">Not assigned</option>
                  {users?.items.filter((u) => u.role === 'sales_executive').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              ) : uname(lead.sales_user_id) ?? <span className="muted">{handedOver ? 'Not assigned' : 'Not handed over yet'}</span>}</dd>
              <dt>Calls</dt><dd>{lead.call_count}{lead.next_call_at && <span className="muted small"> · callback {dateTime(lead.next_call_at)}</span>}</dd>
              {lead.handed_over_at && <><dt>Handed over</dt><dd>{dateTime(lead.handed_over_at)}</dd></>}
            </dl>
            <div className="row wrap" style={{ marginTop: 12 }}>
              {has('call.log') && !handedOver && <Link className="btn btn-sm btn-primary" to="/calls"><PhoneCall /> Open in calls</Link>}
              {has('visit.manage') && handedOver && <Link className="btn btn-sm btn-primary" to="/visits"><MapPin /> Open in site visits</Link>}
            </div>
          </Card>
          <Card title="Calls">
            {!calls?.items.length ? <p className="muted">No calls yet.</p> : (
              <div className="stack-sm">
                {calls.items.map((c) => (
                  <div key={c.id} className="ai-row">
                    <div className="row-between"><span className="row"><span className="strong">{callOutcomeLabel[c.outcome]}</span>{c.temperature && <TempBadge t={c.temperature} />}{c.handed_over && <Badge tone="purple">Handed over</Badge>}</span><span className="muted small">{dateTime(c.created_at)}</span></div>
                    {c.notes && <span>{c.notes}</span>}
                    <span className="muted small">{c.user_name}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Site visits">
            {!visits?.items.length ? <p className="muted">No site visits yet.</p> : (
              <div className="stack-sm">
                {visits.items.map((v) => (
                  <div key={v.id} className="ai-row">
                    <div className="row-between"><span className="strong">{v.location}</span><Badge tone={visitStatusTone[v.status]}>{v.outcome ? visitOutcomeLabel[v.outcome] : humanize(v.status)}</Badge></div>
                    <span className="muted small">{dateTime(v.scheduled_at)} · {v.user_name}</span>
                    {v.notes && <span>{v.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Follow-ups">
            {!leadFus.length ? <p className="muted">None scheduled.</p> : (
              <div className="stack-sm">
                {leadFus.map((f) => (
                  <div key={f.id} className="ai-row">
                    <div className="row-between"><span className="strong">{f.reason}</span><Badge tone={followTone[f.status]}>{f.status}</Badge></div>
                    <span className="muted small">{dateTime(f.scheduled_at)} · {channelName[f.channel]} · {f.created_actor_type === 'ai_agent' ? 'by AI' : 'by staff'}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      {editing && <LeadFormModal lead={lead} onClose={() => setEditing(false)} />}
      {scheduling && <FollowUpModal customerId={lead.customer_id} leadId={lead.id} onClose={() => setScheduling(false)} />}
    </div>
  );
}

function Fact({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ padding: '4px 18px 4px 0', marginRight: 18, borderRight: last ? 0 : '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
      <span className="muted small">{label}</span>
      {children}
    </div>
  );
}
