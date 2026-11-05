// One site visit, shown to the sales executive (do the visit, write the report) and to the
// sales manager (check the report, reschedule / reassign / cancel).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Mail, MapPin, Navigation, Phone, StickyNote, UserX, XCircle } from 'lucide-react';
import {
  useCancelVisit, useCheckinVisit, useCompleteVisit, useLeadCalls, useLeadVisits, useRescheduleRequest, useStartVisit, useUpdateLead, useUpdateVisit, useUsers,
} from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Customer, InterestLevel, Lead, SiteVisit, VisitOutcome } from '@/api/types';
import { Avatar, Badge, Field, useToast } from '@/components/ui';
import { StageBadge, TempBadge } from '@/components/leadBits';
import { ago, dateTime, interestLabel, mapsUrl, money, timeOnly, visitOutcomeLabel, visitStatusLabel, visitStatusTone } from '@/lib/format';

export const ACTIVE = ['scheduled', 'on_the_way', 'checked_in'];
export const isActive = (v: SiteVisit) => ACTIVE.includes(v.status);
export const isLate = (v: SiteVisit) => isActive(v) && new Date(v.scheduled_at).getTime() < Date.now();

/** "in 2 h" / "45 min late" relative to the visit time. */
export function whenText(v: SiteVisit) {
  const diff = new Date(v.scheduled_at).getTime() - Date.now();
  if (!isActive(v)) return dateTime(v.scheduled_at);
  const m = Math.round(Math.abs(diff) / 60000);
  const t = m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return diff >= 0 ? `in ${t}` : `${t} ago`;
}

const OUTCOMES: VisitOutcome[] = ['booked', 'negotiating', 'interested', 'not_interested'];
const LEVELS: InterestLevel[] = ['high', 'medium', 'low'];
const STEPS = ['scheduled', 'on_the_way', 'checked_in', 'completed'] as const;
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function VisitPanel({ visit, lead, customer, mode }: { visit: SiteVisit; lead?: Lead; customer?: Customer; mode: 'exec' | 'manager' }) {
  const { data: calls } = useLeadCalls(visit.lead_id);
  const { data: history } = useLeadVisits(visit.lead_id);
  const notes = (calls?.items ?? []).filter((c) => c.notes).slice(0, 3);
  const previous = (history?.items ?? []).filter((v) => v.id !== visit.id && v.status === 'completed');
  const late = isLate(visit);

  return (
    <section className="card card-pad stack" aria-label="Visit details">
      <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
        <div className="row">
          <Avatar name={customer?.full_name} size="lg" />
          <div>
            <h2 style={{ fontSize: 22 }}>{customer?.full_name ?? '—'}</h2>
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              <Badge tone={visitStatusTone[visit.status]} dot>{visitStatusLabel[visit.status]}</Badge>
              {lead && <StageBadge s={lead.status} />}
              {lead?.temperature && <TempBadge t={lead.temperature} />}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="strong" style={{ fontSize: 20 }}>{timeOnly(visit.scheduled_at)}</div>
          <div className="small" style={{ color: late ? 'var(--red)' : 'var(--muted)' }}>{new Date(visit.scheduled_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {whenText(visit)}</div>
        </div>
      </div>

      <Steps visit={visit} />

      {visit.reschedule_reason && isActive(visit) && (
        <div className="alert alert-warn"><CalendarClock /><div><b>New time requested{mode === 'manager' ? ` by ${visit.user_name}` : ''}:</b> {visit.reschedule_reason}</div></div>
      )}

      <div className="visit-facts">
        <a className="visit-fact" href={customer?.primary_phone ? `tel:${customer.primary_phone.replace(/\s/g, '')}` : undefined} aria-disabled={!customer?.primary_phone}>
          <Phone /><span><span className="muted small">Call customer</span><b>{customer?.primary_phone ?? 'No phone'}</b></span>
        </a>
        <a className="visit-fact" href={mapsUrl(visit.location)} target="_blank" rel="noreferrer">
          <MapPin /><span><span className="muted small">Site · open in Maps</span><b>{visit.location}</b></span>
        </a>
        {customer?.primary_email && <a className="visit-fact" href={`mailto:${customer.primary_email}`}><Mail /><span><span className="muted small">Email</span><b>{customer.primary_email}</b></span></a>}
        {lead && (
          <Link className="visit-fact" to={`/leads/${lead.id}`}>
            <ClipboardList /><span><span className="muted small">Interested in</span><b>{lead.title}{lead.estimated_value != null ? ` · ${money(lead.estimated_value)}` : ''}</b></span>
          </Link>
        )}
      </div>

      {visit.manager_notes && (
        <div className="note-box"><StickyNote /><div><div className="muted small">Note from {visit.assigned_by_name ?? 'your manager'}</div>{visit.manager_notes}</div></div>
      )}

      <div>
        <h3 style={{ marginBottom: 8 }}>What marketing found on the call</h3>
        {!notes.length ? <p className="muted small">No call notes.</p> : (
          <div className="stack-sm">
            {notes.map((c) => (
              <div key={c.id} className="ai-row">
                <div className="row-between"><span className="row">{c.temperature && <TempBadge t={c.temperature} />}<span className="muted small">{c.user_name}</span></span><span className="muted small">{ago(c.created_at)}</span></div>
                <span>{c.notes}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {previous.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Earlier visits</h3>
          {previous.map((v) => <ReportView key={v.id} v={v} compact />)}
        </div>
      )}

      {visit.status === 'completed' || visit.status === 'no_show' || visit.status === 'cancelled'
        ? <ReportView v={visit} />
        : mode === 'exec' ? <ExecActions visit={visit} /> : <ManagerActions visit={visit} />}

      {mode === 'exec' && lead?.status === 'negotiation' && !isActive(visit) && <CloseDeal lead={lead} />}
    </section>
  );
}

function Steps({ visit }: { visit: SiteVisit }) {
  if (visit.status === 'cancelled' || visit.status === 'no_show') return null;
  const at = STEPS.indexOf(visit.status as (typeof STEPS)[number]);
  const label = ['Scheduled', 'On the way', 'At the site', 'Report written'];
  const time = [null, visit.started_at, visit.checked_in_at, visit.completed_at];
  return (
    <ol className="steps" aria-label="Visit progress">
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <span className="dotn">{i < at || visit.status === 'completed' ? <CheckCircle2 size={14} /> : i + 1}</span>
          <span><b>{label[i]}</b>{time[i] && <span className="muted small"> {timeOnly(time[i]!)}</span>}</span>
        </li>
      ))}
    </ol>
  );
}

export function ReportView({ v, compact }: { v: SiteVisit; compact?: boolean }) {
  if (v.status === 'no_show' || v.status === 'cancelled') {
    return <div className="alert alert-error" style={{ marginBottom: 8 }}><UserX /><div><b>{visitStatusLabel[v.status]}</b>{v.notes && ` — ${v.notes}`}<div className="small">{dateTime(v.scheduled_at)} · {v.user_name}</div></div></div>;
  }
  return (
    <div className="report" style={compact ? { marginBottom: 8 } : undefined}>
      <div className="row-between wrap">
        <span className="row"><CheckCircle2 size={18} color="var(--green)" /><b>Visit report</b>{v.outcome && <Badge tone={v.outcome === 'booked' ? 'green' : v.outcome === 'not_interested' ? 'red' : 'amber'}>{visitOutcomeLabel[v.outcome]}</Badge>}
          {v.interest_level && <Badge>{interestLabel[v.interest_level]} interest</Badge>}</span>
        <span className="muted small">{v.user_name} · {v.completed_at && dateTime(v.completed_at)}</span>
      </div>
      {v.feedback && <p><span className="muted small">Customer said: </span>{v.feedback}</p>}
      {!compact && v.next_step && <p><span className="muted small">Next step: </span>{v.next_step}{v.follow_up_at && <> · <b>{dateTime(v.follow_up_at)}</b></>}</p>}
      {!compact && v.notes && <p><span className="muted small">Notes: </span>{v.notes}</p>}
      {!compact && v.checked_in_at && <p className="muted small">Arrived {timeOnly(v.checked_in_at)} · {v.location}</p>}
    </div>
  );
}

function ExecActions({ visit }: { visit: SiteVisit }) {
  const start = useStartVisit();
  const checkin = useCheckinVisit();
  const cancel = useCancelVisit();
  const ask = useRescheduleRequest();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const onErr = (e: unknown) => toast(errorMessage(e), true);
  const reportOpen = visit.status === 'checked_in' || isLate(visit);

  return (
    <div className="stack">
      <div className="row wrap">
        {visit.status === 'scheduled' && <button className="btn btn-primary" onClick={() => start.mutate(visit.id, { onSuccess: () => toast('Marked as on the way'), onError: onErr })}><Navigation /> I'm on my way</button>}
        {visit.status !== 'checked_in' && <button className={`btn ${visit.status === 'on_the_way' ? 'btn-primary' : ''}`} onClick={() => checkin.mutate(visit.id, { onSuccess: () => toast('Checked in at the site'), onError: onErr })}><MapPin /> I've arrived</button>}
        <span className="grow" />
        {visit.status !== 'checked_in' && <button className="btn btn-sm" onClick={() => setAsking(!asking)}><CalendarClock /> Ask for a new time</button>}
        <button className="btn btn-sm" onClick={() => confirm('Mark that the customer did not come?') && cancel.mutate({ id: visit.id, no_show: true }, { onSuccess: () => toast('Marked as no-show — your manager is told'), onError: onErr })}><UserX /> Customer didn't come</button>
      </div>
      {asking && (
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); ask.mutate({ id: visit.id, reason }, { onSuccess: () => { toast('Sent to your manager'); setAsking(false); setReason(''); }, onError: onErr }); }}>
          <input className="input grow" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? e.g. customer asked to move to Saturday morning" required style={{ minWidth: 240 }} />
          <button className="btn btn-primary">Send to manager</button>
        </form>
      )}
      {reportOpen ? <ReportForm visit={visit} /> : <p className="muted small">The visit report opens when you check in at the site (or once the visit time has passed).</p>}
    </div>
  );
}

function ReportForm({ visit }: { visit: SiteVisit }) {
  const complete = useCompleteVisit();
  const toast = useToast();
  const [outcome, setOutcome] = useState<VisitOutcome | null>(null);
  const [level, setLevel] = useState<InterestLevel | null>(null);
  const [feedback, setFeedback] = useState('');
  const [next, setNext] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const needsFollowUp = outcome === 'negotiating' || outcome === 'interested';

  return (
    <form className="report-form stack" onSubmit={(e) => {
      e.preventDefault(); setErr('');
      if (!outcome) return setErr('Choose what happened at the visit.');
      if (!level) return setErr('Choose how interested the customer is.');
      complete.mutate({ id: visit.id, outcome, interest_level: level, feedback, next_step: next, follow_up_at: followUp ? new Date(followUp).toISOString() : null, notes }, {
        onSuccess: () => toast(outcome === 'booked' ? 'Report saved — deal won 🎉' : 'Visit report saved'),
        onError: (x) => setErr(errorMessage(x)),
      });
    }}>
      <h3 className="row"><ClipboardList size={18} /> Visit report</h3>
      <Field label="What happened?">
        <div className="chips" role="radiogroup">
          {OUTCOMES.map((o) => <button key={o} type="button" role="radio" aria-checked={outcome === o} className={`chip ${outcome === o ? 'on' : ''}`} onClick={() => setOutcome(o)}>{visitOutcomeLabel[o]}</button>)}
        </div>
      </Field>
      <Field label="How interested is the customer?">
        <div className="chips" role="radiogroup">
          {LEVELS.map((l) => <button key={l} type="button" role="radio" aria-checked={level === l} className={`chip ${level === l ? 'on' : ''}`} onClick={() => setLevel(l)}>{interestLabel[l]}</button>)}
        </div>
      </Field>
      <Field label="What did the customer say?"><textarea className="textarea" value={feedback} onChange={(e) => setFeedback(e.target.value)} required placeholder="Liked the location, worried about parking, asked for 5% off…" /></Field>
      <div className="form-grid">
        <Field label="Next step"><input className="input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Send price sheet, second visit with spouse…" /></Field>
        <Field label={needsFollowUp ? 'Follow-up date (recommended)' : 'Follow-up date (optional)'}><input className="input" type="datetime-local" value={followUp} min={toLocalInput(new Date())} onChange={(e) => setFollowUp(e.target.value)} /></Field>
      </div>
      <Field label="Other notes (only staff see this)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {outcome === 'interested' && <p className="muted small">This lead goes back to your sales manager to assign another visit.</p>}
      {err && <div className="error-text">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={complete.isPending}><CheckCircle2 /> Save report</button></div>
    </form>
  );
}

function ManagerActions({ visit }: { visit: SiteVisit }) {
  const { data: users } = useUsers();
  const update = useUpdateVisit();
  const cancel = useCancelVisit();
  const toast = useToast();
  const [f, setF] = useState({ user_id: visit.user_id, when: toLocalInput(new Date(visit.scheduled_at)), location: visit.location, manager_notes: visit.manager_notes });
  const [err, setErr] = useState('');
  const execs = users?.items.filter((u) => u.role === 'sales_executive' && u.is_active) ?? [];
  return (
    <div className="stack">
      {isLate(visit) && <div className="alert alert-warn"><AlertTriangle /><div><b>Report not written yet.</b> The visit time has passed — check with {visit.user_name}.</div></div>}
      <form className="report-form stack" onSubmit={(e) => {
        e.preventDefault(); setErr('');
        update.mutate({ id: visit.id, user_id: f.user_id, scheduled_at: new Date(f.when).toISOString(), location: f.location, manager_notes: f.manager_notes }, {
          onSuccess: () => toast('Visit updated — the executive is told'), onError: (x) => setErr(errorMessage(x)),
        });
      }}>
        <h3 className="row"><CalendarClock size={18} /> Reschedule or reassign</h3>
        <div className="form-grid">
          <Field label="Sales executive">
            <select className="select" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}>{execs.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
          </Field>
          <Field label="Date & time"><input className="input" type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} required /></Field>
          <Field label="Site address" className="full"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} required /></Field>
          <Field label="Note for the executive" className="full"><input className="input" value={f.manager_notes} onChange={(e) => setF({ ...f, manager_notes: e.target.value })} /></Field>
        </div>
        {err && <div className="error-text">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => confirm('Cancel this visit? The lead goes back to the "needs a visit" list.') && cancel.mutate({ id: visit.id }, { onSuccess: () => toast('Visit cancelled'), onError: (x) => toast(errorMessage(x), true) })}><XCircle /> Cancel visit</button>
          <button className="btn btn-primary" disabled={update.isPending}>Save changes</button>
        </div>
      </form>
    </div>
  );
}

function CloseDeal({ lead }: { lead: Lead }) {
  const update = useUpdateLead();
  const toast = useToast();
  return (
    <div className="report-form row-between wrap">
      <div><b>Negotiating</b><div className="muted small">Close the deal when the customer decides.</div></div>
      <div className="row">
        <button className="btn" onClick={() => update.mutate({ id: lead.id, status: 'lost' }, { onSuccess: () => toast('Marked lost') })}><XCircle /> Lost</button>
        <button className="btn btn-primary" onClick={() => confirm('Mark this deal as won?') && update.mutate({ id: lead.id, status: 'converted' }, { onSuccess: () => toast('Deal won 🎉'), onError: (x) => toast(errorMessage(x), true) })}><CheckCircle2 /> Deal won</button>
      </div>
    </div>
  );
}
