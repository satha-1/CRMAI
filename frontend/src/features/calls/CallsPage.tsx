// Marketing executive workspace: call queue → call the customer → record outcome, mark hot / warm / cold,
// set a callback, or hand the lead to sales. Marketing managers see the whole team's queue.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, CalendarClock, Mail, MessageSquareText, Phone, PhoneCall, PhoneOff } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { isManager } from '@/auth/permissions';
import { useCustomers, useLeadCalls, useLeadsFor, useLogCall, useUsers } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { CallOutcome, Customer, Lead, Temperature } from '@/api/types';
import { Avatar, Badge, EmptyState, Field, Loading, PageHeader, useToast } from '@/components/ui';
import { StageBadge, TempBadge, TempPicker } from '@/components/leadBits';
import { ago, callOutcomeLabel, dateTime, money } from '@/lib/format';
import { Group } from '../followups/FollowUpsPage';

export function CallsPage() {
  const { role } = useAuth();
  const manager = isManager(role);
  const [exec, setExec] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading } = useLeadsFor({ status: 'new,contacted', team: 'marketing' });
  const { data: handed } = useLeadsFor({ status: 'qualified,site_visit,negotiation,converted', team: 'marketing' });
  const { data: customers } = useCustomers();
  const { data: users } = useUsers();
  const cmap = useMemo(() => new Map(customers?.items.map((c) => [c.id, c])), [customers]);
  const execs = users?.items.filter((u) => u.role === 'marketing_executive') ?? [];

  const leads = (data?.items ?? []).filter((l) => !exec || l.marketing_user_id === exec);
  const now = Date.now();
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  const due = leads.filter((l) => l.next_call_at && new Date(l.next_call_at) <= eod).sort((a, b) => a.next_call_at!.localeCompare(b.next_call_at!));
  const dueIds = new Set(due.map((l) => l.id));
  const fresh = leads.filter((l) => l.status === 'new' && !dueIds.has(l.id));
  const byTemp = (t: Temperature) => leads.filter((l) => l.status === 'contacted' && l.temperature === t && !dueIds.has(l.id));
  const recentHandover = (handed?.items ?? []).filter((l) => !exec || l.marketing_user_id === exec)
    .sort((a, b) => (b.handed_over_at ?? '').localeCompare(a.handed_over_at ?? '')).slice(0, 8);
  const all = [...due, ...fresh, ...byTemp('hot'), ...byTemp('warm'), ...byTemp('cold')];
  const current = all.find((l) => l.id === selected) ?? recentHandover.find((l) => l.id === selected) ?? all[0];

  const row = (l: Lead) => {
    const c = cmap.get(l.customer_id);
    const overdue = l.next_call_at && new Date(l.next_call_at).getTime() < now;
    return (
      <div key={l.id} role="button" tabIndex={0} className={`list-item ${current?.id === l.id ? 'selected' : ''}`}
        onClick={() => setSelected(l.id)} onKeyDown={(e) => e.key === 'Enter' && setSelected(l.id)}>
        <Avatar name={c?.full_name} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-between"><span className="strong ellipsis">{c?.full_name}</span><TempBadge t={l.temperature} empty="New" /></div>
          <div className="muted small ellipsis">{l.title} · {c?.primary_phone ?? 'no phone'}</div>
          <div className="row small" style={{ gap: 8, marginTop: 2 }}>
            {l.next_call_at && <span style={{ color: overdue ? 'var(--red)' : 'var(--text-2)' }}><CalendarClock size={12} style={{ verticalAlign: -2 }} /> {dateTime(l.next_call_at)}</span>}
            <span className="muted">{l.call_count ? `${l.call_count} call${l.call_count > 1 ? 's' : ''}` : 'Never called'}</span>
            {l.call_instruction && <span title={l.call_instruction} style={{ color: 'var(--primary)' }}><MessageSquareText size={12} style={{ verticalAlign: -2 }} /> note</span>}
            {manager && l.marketing_user_id && <span className="muted">· {users?.items.find((u) => u.id === l.marketing_user_id)?.full_name}</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="content">
      <PageHeader title={manager ? 'Team calls' : 'My calls'}
        sub="Call each lead, mark it hot, warm or cold, and hand hot leads to the sales team."
        actions={manager && (
          <select className="select" style={{ width: 220 }} value={exec} onChange={(e) => setExec(e.target.value)} aria-label="Marketing executive">
            <option value="">All marketing executives</option>
            {execs.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        )} />
      <div className="grid g-4">
        <Count label="Callbacks due today" value={due.length} tone="red" />
        <Count label="Not called yet" value={fresh.length} tone="teal" />
        <Count label="Hot leads" value={leads.filter((l) => l.temperature === 'hot').length} tone="amber" />
        <Count label="Handed to sales" value={(handed?.items ?? []).filter((l) => !exec || l.marketing_user_id === exec).length} tone="purple" />
      </div>
      <div className="grid g-side-main" style={{ alignItems: 'start' }}>
        <section className="card card-pad stack">
          {isLoading ? <Loading /> : !all.length && !recentHandover.length ? (
            <EmptyState icon={<PhoneCall />} title="No leads to call" body={manager ? 'Assign new leads from Lead assignment.' : 'Your manager will assign new leads to you.'} />
          ) : (
            <>
              <Group title="Callbacks due" items={due} render={row} />
              <Group title="Not called yet" items={fresh} render={row} />
              <Group title="Hot" items={byTemp('hot')} render={row} />
              <Group title="Warm" items={byTemp('warm')} render={row} />
              <Group title="Cold" items={byTemp('cold')} render={row} defaultOpen={false} />
              <Group title="Handed to sales" items={recentHandover} render={row} defaultOpen={false} />
            </>
          )}
        </section>
        {current ? <CallPanel key={current.id} lead={current} customer={cmap.get(current.customer_id)} /> : <section className="card"><EmptyState title="Pick a lead to call" /></section>}
      </div>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card card-pad">
      <div className="muted">{label}</div>
      <div className="kpi-value" style={{ color: `var(--${tone === 'teal' ? 'teal' : tone === 'purple' ? 'purple' : tone === 'amber' ? 'amber' : 'red'})` }}>{value}</div>
    </div>
  );
}

const OUTCOMES: CallOutcome[] = ['answered', 'no_answer', 'busy', 'call_back', 'wrong_number'];

function CallPanel({ lead, customer }: { lead: Lead; customer?: Customer }) {
  const { has } = useAuth();
  const { data: calls } = useLeadCalls(lead.id);
  const log = useLogCall();
  const toast = useToast();
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [temp, setTemp] = useState<Temperature | null>(lead.temperature);
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('');
  const [handOver, setHandOver] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (temp === 'cold') setHandOver(false); }, [temp]);
  const withSales = !['new', 'contacted'].includes(lead.status);
  const canHandOver = outcome === 'answered' && (temp === 'hot' || temp === 'warm');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!outcome) return setErr('Choose how the call went.');
    if (outcome === 'answered' && !temp) return setErr('Mark the lead hot, warm or cold.');
    log.mutate({
      lead_id: lead.id, outcome, temperature: temp, notes, hand_over: canHandOver && handOver,
      next_call_at: next ? new Date(next).toISOString() : null,
    }, {
      onSuccess: () => {
        toast(handOver && canHandOver ? 'Handed over to sales 🎉' : 'Call logged');
        setOutcome(null); setNotes(''); setNext(''); setHandOver(false);
      },
      onError: (x) => setErr(errorMessage(x)),
    });
  };

  return (
    <section className="card card-pad stack" style={{ gap: 16 }}>
      <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={customer?.full_name} size="lg" />
          <div className="stack-sm">
            <Link to={`/customers/${lead.customer_id}`} style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{customer?.full_name}</Link>
            <div className="row wrap"><StageBadge s={lead.status} /><TempBadge t={lead.temperature} empty="Not rated" /><span className="muted small">Lead created {ago(lead.created_at)}</span></div>
          </div>
        </div>
        {customer?.primary_phone
          ? <a className="phone-link" href={`tel:${customer.primary_phone.replace(/[^\d+]/g, '')}`}><Phone size={20} color="var(--green)" />{customer.primary_phone}</a>
          : <span className="row muted"><PhoneOff size={18} />No phone number</span>}
      </div>
      <div className="row wrap muted small" style={{ gap: 16 }}>
        <span><b style={{ color: 'var(--text)' }}><Link to={`/leads/${lead.id}`}>{lead.title}</Link></b></span>
        {lead.estimated_value != null && <span className="money">{money(lead.estimated_value)}</span>}
        {customer?.primary_email && <span className="row" style={{ gap: 4 }}><Mail size={13} />{customer.primary_email}</span>}
      </div>
      <p style={{ color: 'var(--text-2)', background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 10, whiteSpace: 'pre-wrap' }}>{lead.interest_summary}</p>

      {withSales ? (
        <div className="alert alert-info"><ArrowRightLeft /><div>Handed to sales {lead.handed_over_at ? ago(lead.handed_over_at) : ''}. The sales team now owns this lead.</div></div>
      ) : has('call.log') && (
        <form className="stack" onSubmit={submit} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h3>Log this call</h3>
          {lead.call_instruction && <div className="note-box"><MessageSquareText /><div><div className="muted small">From your manager</div>{lead.call_instruction}</div></div>}
          <Field label="How did the call go?">
            <div className="chips" role="radiogroup">
              {OUTCOMES.map((o) => (
                <button type="button" key={o} role="radio" aria-checked={outcome === o} className={`chip ${outcome === o ? 'on' : ''}`} onClick={() => setOutcome(o)}>{callOutcomeLabel[o]}</button>
              ))}
            </div>
          </Field>
          {outcome === 'answered' && <Field label="How interested are they?"><TempPicker value={temp} onChange={setTemp} /></Field>}
          <Field label="Notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Budget, timeline, what they asked about…" /></Field>
          {outcome && outcome !== 'wrong_number' && !(canHandOver && handOver) && (
            <Field label="Call back on (optional)"><input className="input" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          )}
          {outcome === 'answered' && (
            <label className={`handover ${canHandOver ? '' : 'disabled'}`}>
              <input type="checkbox" checked={handOver} disabled={!canHandOver} onChange={(e) => setHandOver(e.target.checked)} />
              <span><b>Hand over to sales</b><br /><span className="small muted">{canHandOver ? 'The sales manager will assign a sales executive for the site visit.' : 'Only hot or warm leads can be handed over.'}</span></span>
            </label>
          )}
          {err && <div className="error-text">{err}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={log.isPending}><PhoneCall /> {canHandOver && handOver ? 'Save & hand over' : 'Save call'}</button>
          </div>
        </form>
      )}

      <div className="stack-sm">
        <h3>Call history</h3>
        {!calls?.items.length && <p className="muted small">No calls yet.</p>}
        {calls?.items.map((c) => (
          <div key={c.id} className="ai-row">
            <div className="row-between">
              <span className="row"><span className="strong">{callOutcomeLabel[c.outcome]}</span>{c.temperature && <TempBadge t={c.temperature} />}{c.handed_over && <Badge tone="purple">Handed to sales</Badge>}</span>
              <span className="muted small nowrap">{dateTime(c.created_at)}</span>
            </div>
            {c.notes && <span style={{ color: 'var(--text-2)' }}>{c.notes}</span>}
            <span className="muted small">{c.user_name}{c.next_call_at ? ` · callback ${dateTime(c.next_call_at)}` : ''}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
