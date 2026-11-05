// Mockup 04 layout (grouped list + detail pane) applied to follow-ups: due and upcoming, complete / cancel.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Building2, CalendarClock, Check, ChevronDown, Plus, Radio, User, XCircle } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCancelFollowUp, useCompleteFollowUp, useCreateFollowUp, useCustomers, useFollowUps, useLeads, useUsers } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { FollowUp } from '@/api/types';
import { Avatar, Badge, EmptyState, Field, Loading, Modal, PageHeader, Segmented, useToast } from '@/components/ui';
import { channelName, dateTime, followTone, humanize } from '@/lib/format';

export function groupByDue<T>(items: T[], due: (t: T) => string | null, done: (t: T) => boolean) {
  const now = new Date();
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  const g = { Overdue: [] as T[], Today: [] as T[], Upcoming: [] as T[], Completed: [] as T[] };
  for (const t of items) {
    const d = due(t);
    if (done(t)) g.Completed.push(t);
    else if (d && new Date(d) < now) g.Overdue.push(t);
    else if (d && new Date(d) <= eod) g.Today.push(t);
    else g.Upcoming.push(t);
  }
  return g;
}

export function Group<T>({ title, items, render, defaultOpen = true }: { title: string; items: T[]; render: (t: T) => React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!items.length) return null;
  return (
    <div className="stack-sm">
      <button className="group-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform .15s' }} />
        {title} <span className="muted" style={{ fontWeight: 500 }}>({items.length})</span>
      </button>
      {open && items.map(render)}
    </div>
  );
}

export function FollowUpsPage() {
  const { has } = useAuth();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useFollowUps({ assignee: scope === 'mine' ? 'me' : undefined });
  const { data: customers } = useCustomers();
  const cname = useMemo(() => new Map(customers?.items.map((c) => [c.id, c.full_name])), [customers]);
  const complete = useCompleteFollowUp();
  const toast = useToast();
  const items = (data?.items ?? []).filter((f) => f.status !== 'cancelled');
  const groups = groupByDue(items, (f) => f.scheduled_at, (f) => f.status === 'completed' || f.status === 'missed');
  const current = items.find((f) => f.id === selected) ?? groups.Overdue[0] ?? groups.Today[0] ?? groups.Upcoming[0];

  const row = (f: FollowUp) => {
    const done = f.status === 'completed';
    const tone = f.status === 'missed' ? 'red' : done ? 'green' : new Date(f.scheduled_at) < new Date() ? 'red' : 'teal';
    return (
      <div key={f.id} role="button" tabIndex={0} className={`list-item ${current?.id === f.id ? 'selected' : ''}`} onClick={() => setSelected(f.id)} onKeyDown={(e) => e.key === 'Enter' && setSelected(f.id)}>
        <button className={`check ${done ? 'on' : ''}`} aria-label={done ? 'Completed' : 'Mark complete'} disabled={done || !has('followup.write')}
          onClick={(e) => { e.stopPropagation(); complete.mutate({ id: f.id }, { onSuccess: () => toast('Follow-up completed'), onError: (x) => toast(errorMessage(x), true) }); }}>
          {done && <Check />}
        </button>
        <div className="grow">
          <div className={`strong ${done ? 'done-text' : ''}`}>{f.reason}</div>
          <div className="row muted small" style={{ gap: 10 }}><span className="row" style={{ gap: 4 }}><User size={13} />{cname.get(f.customer_id)}</span><span className="row" style={{ gap: 4 }}><Radio size={13} />{channelName[f.channel]}</span></div>
        </div>
        <Badge tone={tone}>{f.status === 'missed' ? 'Missed' : dateTime(f.scheduled_at)}</Badge>
      </div>
    );
  };

  return (
    <div className="content">
      <PageHeader title="Follow-ups" sub="Promised call-backs — many are scheduled by the AI during chats."
        actions={has('followup.write') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> New follow-up</button>} />
      <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My follow-ups' }, { value: 'all', label: 'All follow-ups' }]} />
      <div className="grid g-side-main" style={{ alignItems: 'start' }}>
        <section className="card card-pad stack">
          {isLoading ? <Loading /> : !items.length ? <EmptyState icon={<CalendarClock />} title="No follow-ups" /> : (
            <>
              <Group title="Overdue" items={groups.Overdue} render={row} />
              <Group title="Today" items={groups.Today} render={row} />
              <Group title="Upcoming" items={groups.Upcoming} render={row} />
              <Group title="Completed" items={groups.Completed} render={row} defaultOpen={false} />
            </>
          )}
        </section>
        {current ? <FollowUpDetail f={current} customerName={cname.get(current.customer_id) ?? ''} /> : <section className="card"><EmptyState title="Select a follow-up" /></section>}
      </div>
      {creating && <FollowUpModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function FollowUpDetail({ f, customerName }: { f: FollowUp; customerName: string }) {
  const { has } = useAuth();
  const { data: users } = useUsers();
  const { data: leads } = useLeads({ customer_id: f.customer_id });
  const complete = useCompleteFollowUp();
  const cancel = useCancelFollowUp();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const lead = leads?.items.find((l) => l.id === f.lead_id);
  const assignee = users?.items.find((u) => u.id === f.assigned_user_id)?.full_name;
  const open = f.status === 'scheduled';
  return (
    <section className="card card-pad stack" style={{ gap: 16 }}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <h2 style={{ fontSize: 24 }}>{f.reason}</h2>
        <Badge tone={followTone[f.status]}>{humanize(f.status)}</Badge>
      </div>
      <div className="row"><Badge tone="teal">Follow-up</Badge>{f.created_actor_type === 'ai_agent' && <Badge tone="purple"><Bot size={12} />Scheduled by AI</Badge>}</div>
      <dl className="dl">
        <dt><User />Customer</dt><dd><Link to={`/customers/${f.customer_id}`} className="row"><Avatar name={customerName} size="sm" />{customerName}</Link></dd>
        <dt><User />Assignee</dt><dd>{assignee ? <span className="row"><Avatar name={assignee} size="sm" />{assignee}</span> : 'Unassigned'}</dd>
        <dt><CalendarClock />Scheduled</dt><dd><Badge tone={open && new Date(f.scheduled_at) < new Date() ? 'red' : 'teal'}>{dateTime(f.scheduled_at)}</Badge></dd>
        <dt><Radio />Channel</dt><dd>{channelName[f.channel]}</dd>
        {lead && <><dt><Building2 />Related lead</dt><dd><Link to={`/leads/${lead.id}`} className="strong">{lead.title}</Link></dd></>}
      </dl>
      {f.notes && <div className="alert alert-info">{f.notes}</div>}
      {open && has('followup.write') && (
        <>
          <div className="divider" />
          <Field label="Outcome notes (optional)"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened on the call?" /></Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => cancel.mutate(f.id, { onSuccess: () => toast('Follow-up cancelled') })}><XCircle /> Cancel</button>
            <button className="btn btn-primary" onClick={() => complete.mutate({ id: f.id, notes: notes || undefined }, { onSuccess: () => { toast('Follow-up completed'); setNotes(''); }, onError: (x) => toast(errorMessage(x), true) })}><Check /> Mark complete</button>
          </div>
        </>
      )}
    </section>
  );
}

export function FollowUpModal({ onClose, customerId, leadId }: { onClose: () => void; customerId?: string; leadId?: string }) {
  const { data: customers } = useCustomers();
  const { data: users } = useUsers();
  const { me } = useAuth();
  const create = useCreateFollowUp();
  const toast = useToast();
  const tomorrow = new Date(Date.now() + 86400_000); tomorrow.setHours(14, 0, 0, 0);
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ customer_id: customerId ?? '', scheduled_at: local, channel: 'voice', reason: '', assigned_user_id: me?.id ?? '' });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ ...f, channel: f.channel as FollowUp['channel'], lead_id: leadId ?? null, scheduled_at: new Date(f.scheduled_at).toISOString(), assigned_user_id: f.assigned_user_id || null }, {
      onSuccess: () => { toast('Follow-up scheduled'); onClose(); }, onError: (x) => setErr(errorMessage(x)),
    });
  };
  return (
    <Modal title="Schedule follow-up" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Customer" className="full">
          <select className="select" value={f.customer_id} onChange={set('customer_id')} required disabled={!!customerId}>
            <option value="">Choose…</option>
            {customers?.items.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </Field>
        <Field label="Reason" className="full"><input className="input" value={f.reason} onChange={set('reason')} required placeholder="e.g. Call about Premium package" /></Field>
        <Field label="When" hint="Future, within 30 days"><input className="input" type="datetime-local" value={f.scheduled_at} onChange={set('scheduled_at')} required /></Field>
        <Field label="Channel">
          <select className="select" value={f.channel} onChange={set('channel')}>{Object.entries(channelName).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Assignee" className="full">
          <select className="select" value={f.assigned_user_id} onChange={set('assigned_user_id')}>
            <option value="">Unassigned</option>
            {users?.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </Field>
        {err && <div className="error-text full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={create.isPending}>Schedule</button>
        </div>
      </form>
    </Modal>
  );
}
