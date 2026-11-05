// FRONTEND-ARCHITECTURE §9: header (name, status, email, phone, preferred channel), tabs
// Timeline / Conversations / Leads / Follow-ups, edit form with "Internal notes".
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarPlus, Mail, MessageSquare, Pencil, Phone, Plus, Radio, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useConversations, useCustomer, useCustomerContacts, useFollowUps, useLeads, useTimeline } from '@/api/queries';
import { errorMessage } from '@/api/client';
import { Avatar, Badge, Card, EmptyState, Loading, Tabs } from '@/components/ui';
import { Timeline } from '@/components/Timeline';
import { ago, channelName, convTone, dateShort, dateTime, followTone, humanize, leadTone, money } from '@/lib/format';
import { CustomerFormModal } from './CustomersPage';
import { LeadFormModal } from '../leads/LeadForm';
import { FollowUpModal } from '../followups/FollowUpsPage';

type Tab = 'timeline' | 'conversations' | 'leads' | 'followups';

export function CustomerProfilePage() {
  const { id } = useParams();
  const { has } = useAuth();
  const [tab, setTab] = useState<Tab>('timeline');
  const [modal, setModal] = useState<'edit' | 'lead' | 'followup' | null>(null);
  const { data: c, isLoading, error } = useCustomer(id);
  const { data: tl } = useTimeline(id);
  const { data: convs } = useConversations({ customer_id: id });
  const { data: leads } = useLeads({ customer_id: id });
  const { data: fus } = useFollowUps({ customer_id: id });
  const { data: contacts } = useCustomerContacts(id);

  if (isLoading) return <div className="content"><Card><Loading /></Card></div>;
  if (error || !c) return <div className="content"><EmptyState title="Customer not found" body={errorMessage(error)} /></div>;

  const openLeads = leads?.items.filter((l) => ['new', 'contacted', 'qualified'].includes(l.status)).length ?? 0;
  const next = fus?.items.find((f) => f.status === 'scheduled');
  const channels = new Set((convs?.items ?? []).map((x) => x.channel)).size;

  return (
    <div className="content">
      <nav className="small" aria-label="Breadcrumb"><Link to="/customers">Customers</Link> <span className="muted">/ {c.full_name}</span></nav>
      <section className="card card-pad">
        <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={c.full_name} size="lg" />
            <div className="stack-sm">
              <div className="row wrap"><h1 style={{ fontSize: 26 }}>{c.full_name}</h1><Badge tone={c.status === 'active' ? 'green' : c.status === 'provisional' ? 'amber' : 'gray'} dot>{humanize(c.status)}</Badge></div>
              <div className="row wrap muted" style={{ gap: 18 }}>
                {c.company_name && <span>{c.company_name}</span>}
                <span className="row"><Mail size={15} />{c.primary_email ?? 'No email'}</span>
                <span className="row"><Phone size={15} />{c.primary_phone ?? 'No phone'}</span>
                <span className="row"><Radio size={15} />Prefers {c.preferred_channel ? channelName[c.preferred_channel] : '—'}</span>
              </div>
            </div>
          </div>
          <div className="row wrap">
            {has('followup.write') && <button className="btn" onClick={() => setModal('followup')}><CalendarPlus /> Follow-up</button>}
            {has('lead.write') && <button className="btn" onClick={() => setModal('lead')}><Plus /> Lead</button>}
            {has('customer.write') && <button className="btn btn-primary" onClick={() => setModal('edit')}><Pencil /> Edit</button>}
          </div>
        </div>
        <div className="grid g-4" style={{ marginTop: 18, gap: 12 }}>
          <Mini label="Open leads" value={String(openLeads)} />
          <Mini label="Next follow-up" value={next ? dateTime(next.scheduled_at) : 'None'} />
          <Mini label="Conversations" value={String(convs?.items.length ?? 0)} />
          <Mini label="Distinct channels" value={String(channels)} />
        </div>
      </section>

      <div className="grid g-main-side" style={{ alignItems: 'start' }}>
        <section className="card">
          <div style={{ padding: '6px 20px 0' }}>
            <Tabs value={tab} onChange={setTab} options={[
              { value: 'timeline', label: 'Timeline' }, { value: 'conversations', label: 'Conversations' }, { value: 'leads', label: 'Leads' }, { value: 'followups', label: 'Follow-ups' },
            ]} />
          </div>
          <div className="card-body">
            {tab === 'timeline' && <Timeline items={tl?.items ?? []} />}
            {tab === 'conversations' && (
              !convs?.items.length ? <EmptyState icon={<MessageSquare />} title="No conversations" /> : (
                <div className="stack-sm">
                  {convs.items.map((x) => (
                    <Link key={x.id} to={`/inbox/${x.id}`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <MessageSquare size={18} className="muted" />
                      <div className="grow">
                        <div className="row-between"><span className="strong">{x.subject ?? `${channelName[x.channel]} chat`}</span><span className="muted small">{ago(x.last_message_at)}</span></div>
                        <div className="muted small ellipsis">{x.last_message_preview}</div>
                      </div>
                      <Badge tone={convTone[x.status]}>{humanize(x.status)}</Badge>
                    </Link>
                  ))}
                </div>
              ))}
            {tab === 'leads' && (
              !leads?.items.length ? <EmptyState title="No leads" /> : (
                <table className="table">
                  <thead><tr><th>Lead</th><th>Status</th><th>Value</th><th>Created</th></tr></thead>
                  <tbody>{leads.items.map((l) => (
                    <tr key={l.id}><td><Link to={`/leads/${l.id}`} className="strong">{l.title}</Link></td><td><Badge tone={leadTone[l.status]}>{l.status}</Badge></td><td>{money(l.estimated_value)}</td><td>{dateShort(l.created_at)}</td></tr>
                  ))}</tbody>
                </table>
              ))}
            {tab === 'followups' && (
              !fus?.items.length ? <EmptyState title="No follow-ups" /> : (
                <table className="table">
                  <thead><tr><th>Reason</th><th>When</th><th>Channel</th><th>Status</th></tr></thead>
                  <tbody>{fus.items.map((f) => (
                    <tr key={f.id}><td>{f.reason}</td><td className="nowrap">{dateTime(f.scheduled_at)}</td><td>{channelName[f.channel]}</td><td><Badge tone={followTone[f.status]}>{f.status}</Badge></td></tr>
                  ))}</tbody>
                </table>
              ))}
          </div>
        </section>
        <div className="stack" style={{ gap: 18 }}>
          <Card title="Internal notes">
            <p style={{ whiteSpace: 'pre-wrap', color: c.notes ? 'var(--text-2)' : 'var(--muted)' }}>{c.notes || 'No notes yet.'}</p>
          </Card>
          <Card title="Channel identities">
            {!contacts?.items.length ? <p className="muted">Only the website session is known.</p> : (
              <div className="stack-sm">
                {contacts.items.map((k) => (
                  <div key={k.id} className="row-between">
                    <span><span className="strong">{channelName[k.channel]}</span> <span className="muted">{k.external_identity}</span></span>
                    {k.is_verified ? <Badge tone="green"><ShieldCheck size={12} />Verified</Badge> : <Badge>Unverified</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      {modal === 'edit' && <CustomerFormModal customer={c} onClose={() => setModal(null)} />}
      {modal === 'lead' && <LeadFormModal customerId={c.id} onClose={() => setModal(null)} />}
      {modal === 'followup' && <FollowUpModal customerId={c.id} onClose={() => setModal(null)} />}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
      <div className="muted small">{label}</div>
      <div className="strong" style={{ fontSize: 16 }}>{value}</div>
    </div>
  );
}
