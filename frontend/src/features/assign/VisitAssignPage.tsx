// Sales manager: leads that marketing handed over as interested (hot / warm) → assign a site visit:
// which sales executive, when, and where. Warns when the executive already has a visit close to that time.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarPlus, CheckCircle2, MapPin, Phone, Repeat } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCustomers, useLeadCalls, useLeadsFor, useScheduleVisit, useUsers, useVisits } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Customer, Lead, SiteVisit } from '@/api/types';
import { Avatar, Badge, EmptyState, Field, Loading, PageHeader, useToast } from '@/components/ui';
import { TempBadge } from '@/components/leadBits';
import { ago, money, timeOnly, visitStatusLabel, visitStatusTone } from '@/lib/format';
import { ReportView, isActive } from '../visits/VisitPanel';

const tempRank = (l: Lead) => (l.temperature === 'hot' ? 0 : l.temperature === 'warm' ? 1 : 2);
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const tomorrow10 = () => { const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0); return toLocalInput(d); };

export function VisitAssignPage() {
  const { me } = useAuth();
  const { data, isLoading } = useLeadsFor({ status: 'qualified' });
  const { data: visits } = useVisits({});
  const { data: customers } = useCustomers();
  const { data: users } = useUsers();
  const cmap = useMemo(() => new Map(customers?.items.map((c) => [c.id, c])), [customers]);
  const [selId, setSelId] = useState<string | null>(null);
  const execs = (users?.items ?? []).filter((u) => u.role === 'sales_executive' && u.is_active && (!u.manager_id || u.manager_id === me?.id));
  const uname = (id: string | null) => users?.items.find((u) => u.id === id)?.full_name ?? '—';
  const all = visits?.items ?? [];
  const queue = (data?.items ?? []).slice().sort((a, b) => tempRank(a) - tempRank(b) || (a.handed_over_at ?? '').localeCompare(b.handed_over_at ?? ''));
  const current = queue.find((l) => l.id === selId) ?? queue[0];
  const requests = all.filter((v) => isActive(v) && v.reschedule_reason).length;

  return (
    <div className="content">
      <PageHeader title="Assign site visits" sub="Customers marketing handed over as interested. Pick a sales executive, a time and the site."
        actions={requests > 0 && <Link className="btn" to="/visits?tab=requests"><Repeat /> {requests} reschedule request{requests > 1 ? 's' : ''}</Link>} />
      <div className="flow-strip" aria-label="Lead flow">
        <span className="step">Marketing call · hot / warm</span><ArrowRight size={14} />
        <span className="step on">You assign the visit</span><ArrowRight size={14} />
        <span className="step">Executive goes to the site</span><ArrowRight size={14} />
        <span className="step">Visit report</span><ArrowRight size={14} />
        <span className="step">Won / negotiating / another visit</span>
      </div>
      {isLoading ? <Loading /> : !queue.length ? (
        <section className="card"><EmptyState icon={<CheckCircle2 />} title="Every interested customer has a visit" body="New ones appear here when marketing hands a hot or warm lead to sales, or when a visit report says the customer needs another visit." /></section>
      ) : (
        <div className="grid g-side-main" style={{ alignItems: 'start' }}>
          <section className="card card-pad stack-sm" aria-label="Needs a visit">
            <h2 style={{ marginBottom: 6 }}>Needs a visit <span className="muted" style={{ fontWeight: 500 }}>({queue.length})</span></h2>
            {queue.map((l) => {
              const c = cmap.get(l.customer_id);
              const again = all.some((v) => v.lead_id === l.id && v.status === 'completed');
              return (
                <button key={l.id} className={`list-item ${current?.id === l.id ? 'selected' : ''}`} onClick={() => setSelId(l.id)}>
                  <Avatar name={c?.full_name} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row-between"><span className="strong ellipsis">{c?.full_name}</span><TempBadge t={l.temperature} /></div>
                    <div className="muted small ellipsis">{l.title}{l.estimated_value != null ? ` · ${money(l.estimated_value)}` : ''}</div>
                    <div className="row wrap small" style={{ gap: 6, marginTop: 4 }}>
                      {again ? <Badge tone="purple">Second visit</Badge> : <span className="muted">From {uname(l.marketing_user_id)}</span>}
                      <span className="muted">· {ago(l.handed_over_at ?? l.updated_at)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
          {current && <AssignPanel key={current.id} lead={current} customer={cmap.get(current.customer_id)} execs={execs} visits={all} marketingName={uname(current.marketing_user_id)} />}
        </div>
      )}
    </div>
  );
}

function AssignPanel({ lead, customer, execs, visits, marketingName }: { lead: Lead; customer?: Customer; execs: { id: string; full_name: string }[]; visits: SiteVisit[]; marketingName: string }) {
  const { data: calls } = useLeadCalls(lead.id);
  const schedule = useScheduleVisit();
  const toast = useToast();
  const past = visits.filter((v) => v.lead_id === lead.id && !isActive(v));
  const [f, setF] = useState({ user_id: lead.sales_user_id ?? '', when: tomorrow10(), location: past[0]?.location ?? '', manager_notes: '' });
  const [err, setErr] = useState('');
  const chosen = new Date(f.when);
  const sameDay = (v: SiteVisit) => new Date(v.scheduled_at).toDateString() === chosen.toDateString();
  const execDay = visits.filter((v) => v.user_id === f.user_id && sameDay(v) && v.status !== 'cancelled').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const clash = execDay.find((v) => isActive(v) && Math.abs(new Date(v.scheduled_at).getTime() - chosen.getTime()) < 90 * 60000);
  const countOn = (uid: string) => visits.filter((v) => v.user_id === uid && sameDay(v) && isActive(v)).length;

  return (
    <section className="card card-pad stack" aria-label="Assign a visit">
      <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
        <div className="row"><Avatar name={customer?.full_name} size="lg" /><div>
          <h2 style={{ fontSize: 22 }}><Link to={`/leads/${lead.id}`}>{customer?.full_name}</Link></h2>
          <div className="muted">{lead.title}{lead.estimated_value != null ? ` · ${money(lead.estimated_value)}` : ''}</div>
        </div></div>
        <TempBadge t={lead.temperature} />
      </div>
      <div className="row wrap small" style={{ gap: 16 }}>
        <span className="row"><Phone size={15} />{customer?.primary_phone ?? 'No phone'}</span>
        <span className="muted">Called by {marketingName} · {lead.call_count} call{lead.call_count === 1 ? '' : 's'}</span>
      </div>
      <div>
        <h3 style={{ marginBottom: 8 }}>What the customer told marketing</h3>
        {!calls?.items.filter((c) => c.notes).length ? <p className="muted small">No call notes.</p> : calls.items.filter((c) => c.notes).slice(0, 3).map((c) => (
          <div key={c.id} className="ai-row" style={{ marginBottom: 6 }}><span>{c.notes}</span><span className="muted small">{c.user_name} · {ago(c.created_at)}</span></div>
        ))}
      </div>
      {past.length > 0 && <div><h3 style={{ marginBottom: 8 }}>Earlier visits</h3>{past.map((v) => <ReportView key={v.id} v={v} compact />)}</div>}

      <form className="report-form stack" onSubmit={(e) => {
        e.preventDefault(); setErr('');
        if (!f.user_id) return setErr('Pick a sales executive.');
        schedule.mutate({ lead_id: lead.id, user_id: f.user_id, scheduled_at: chosen.toISOString(), location: f.location, manager_notes: f.manager_notes }, {
          onSuccess: () => toast(`Visit assigned to ${execs.find((x) => x.id === f.user_id)?.full_name}`), onError: (x) => setErr(errorMessage(x)),
        });
      }}>
        <h3 className="row"><CalendarPlus size={18} /> Assign the site visit</h3>
        <div className="form-grid">
          <Field label="Sales executive">
            <select className="select" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} required>
              <option value="">Choose…</option>
              {execs.map((u) => <option key={u.id} value={u.id}>{u.full_name} — {countOn(u.id)} visit{countOn(u.id) === 1 ? '' : 's'} that day</option>)}
            </select>
          </Field>
          <Field label="Date & time"><input className="input" type="datetime-local" value={f.when} min={toLocalInput(new Date())} onChange={(e) => setF({ ...f, when: e.target.value })} required /></Field>
          <Field label="Site address" className="full"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} required placeholder="e.g. Harbor View, Unit A-1203, Colombo 03" /></Field>
          <Field label="Note for the executive (optional)" className="full"><input className="input" value={f.manager_notes} onChange={(e) => setF({ ...f, manager_notes: e.target.value })} placeholder="Bring the price sheet, ask for the decision maker…" /></Field>
        </div>
        {clash && <div className="alert alert-warn"><AlertTriangle /><div>This executive already has a visit at <b>{timeOnly(clash.scheduled_at)}</b> ({clash.location}). Leave enough travel time.</div></div>}
        {f.user_id && execDay.length > 0 && (
          <div className="stack-sm">
            <span className="muted small">Their visits that day</span>
            {execDay.map((v) => <div key={v.id} className="day-slot" style={{ cursor: 'default' }}><b>{timeOnly(v.scheduled_at)}</b><span className="ellipsis grow"><MapPin size={12} /> {v.location}</span><Badge tone={visitStatusTone[v.status]}>{visitStatusLabel[v.status]}</Badge></div>)}
          </div>
        )}
        {err && <div className="error-text">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={schedule.isPending}><CalendarPlus /> Assign visit</button></div>
      </form>
    </section>
  );
}
