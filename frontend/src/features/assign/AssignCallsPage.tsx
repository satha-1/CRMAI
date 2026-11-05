// Marketing manager: assign calls on leads the team already has — callbacks, follow-ups on warm / cold
// leads, or moving a call to another executive. Each call gets an executive, a time and an instruction,
// and shows up at the top of that executive's "My calls" list.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, MessageSquareText, PhoneCall } from 'lucide-react';
import { useAssignCalls, useCustomers, useLeadsFor, useUsers, useWorkload } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Lead } from '@/api/types';
import { Avatar, Card, EmptyState, Field, Loading, PageHeader, Segmented, useToast } from '@/components/ui';
import { TempBadge } from '@/components/leadBits';
import { ago, dateTime } from '@/lib/format';

type Filter = 'all' | 'overdue' | 'unscheduled' | 'hot' | 'warm' | 'cold';
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const nextHour = () => { const d = new Date(Date.now() + 3600_000); d.setMinutes(0, 0, 0); return toLocalInput(d); };

export function AssignCallsPage() {
  const { data, isLoading } = useLeadsFor({ status: 'new,contacted' });
  const { data: load } = useWorkload('marketing');
  const { data: customers } = useCustomers();
  const { data: users } = useUsers();
  const assign = useAssignCalls();
  const toast = useToast();
  const cmap = useMemo(() => new Map(customers?.items.map((c) => [c.id, c])), [customers]);
  const uname = (id: string | null) => users?.items.find((u) => u.id === id)?.full_name;
  const members = load?.items ?? [];

  const [filter, setFilter] = useState<Filter>('all');
  const [exec, setExec] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [f, setF] = useState({ user_id: '', call_at: nextHour(), instruction: '' });

  const now = Date.now();
  const overdue = (l: Lead) => !!l.next_call_at && new Date(l.next_call_at).getTime() < now;
  const leads = (data?.items ?? [])
    .filter((l) => !exec || l.marketing_user_id === exec)
    .filter((l) => filter === 'all' || (filter === 'overdue' ? overdue(l) : filter === 'unscheduled' ? !l.next_call_at : l.temperature === filter))
    .sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || (a.next_call_at ?? '9').localeCompare(b.next_call_at ?? '9'));
  const allOn = leads.length > 0 && leads.every((l) => picked.has(l.id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked.size) return toast('Select at least one lead', true);
    if (!f.user_id) return toast('Choose a marketing executive', true);
    assign.mutate({ lead_ids: [...picked], user_id: f.user_id, call_at: new Date(f.call_at).toISOString(), instruction: f.instruction }, {
      onSuccess: (r) => { toast(`${r.assigned} call${r.assigned > 1 ? 's' : ''} assigned to ${uname(f.user_id)}`); setPicked(new Set()); setF({ ...f, instruction: '' }); },
      onError: (x) => toast(errorMessage(x), true),
    });
  };

  return (
    <div className="content">
      <PageHeader title="Assign calls" sub="Schedule calls on your team's leads: callbacks, follow-ups on warm and cold leads, or give a call to another executive." />

      <Card title={<div className="row"><PhoneCall size={18} /><h2>New call</h2></div>}>
        <form className="assign-call" onSubmit={submit}>
          <Field label="Marketing executive">
            <select className="select" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} aria-label="Marketing executive">
              <option value="">Choose…</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name} — {m.callbacks_due} call{m.callbacks_due === 1 ? '' : 's'} due</option>)}
            </select>
          </Field>
          <Field label="Call at">
            <input className="input" type="datetime-local" value={f.call_at} min={toLocalInput(new Date())} onChange={(e) => setF({ ...f, call_at: e.target.value })} required aria-label="Call at" />
          </Field>
          <Field label="Instruction for the executive" className="grow">
            <input className="input" value={f.instruction} onChange={(e) => setF({ ...f, instruction: e.target.value })} placeholder="Offer the new payment plan, ask about budget…" aria-label="Instruction" />
          </Field>
          <button className="btn btn-primary" disabled={assign.isPending}><CalendarClock /> Assign {picked.size || ''} call{picked.size === 1 ? '' : 's'}</button>
        </form>
        <p className="muted small" style={{ marginTop: 8 }}>{picked.size ? `${picked.size} lead${picked.size > 1 ? 's' : ''} selected below.` : 'Select leads in the table below.'}</p>
      </Card>

      <div className="row-between wrap">
        <Segmented value={filter} onChange={(v) => { setFilter(v); setPicked(new Set()); }} options={[
          { value: 'all', label: 'All' }, { value: 'overdue', label: 'Overdue' }, { value: 'unscheduled', label: 'No call set' },
          { value: 'hot', label: 'Hot' }, { value: 'warm', label: 'Warm' }, { value: 'cold', label: 'Cold' },
        ]} />
        <select className="select" style={{ width: 220 }} value={exec} onChange={(e) => setExec(e.target.value)} aria-label="Filter by executive">
          <option value="">All executives</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
        </select>
      </div>

      <Card pad={false}>
        {isLoading ? <Loading /> : !leads.length ? <EmptyState icon={<PhoneCall />} title="No leads here" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th style={{ width: 40 }}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(leads.map((l) => l.id)))} /></th>
                <th>Customer</th><th>Lead</th><th>Temperature</th><th>Executive</th><th>Next call</th><th>Calls</th><th>Instruction</th>
              </tr></thead>
              <tbody>
                {leads.map((l) => {
                  const c = cmap.get(l.customer_id);
                  return (
                    <tr key={l.id} className={`clickable ${picked.has(l.id) ? 'selected' : ''}`} onClick={() => toggle(l.id)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${c?.full_name}`} checked={picked.has(l.id)} onChange={() => toggle(l.id)} /></td>
                      <td><div className="row"><Avatar name={c?.full_name} size="sm" /><div><div className="strong">{c?.full_name}</div><div className="muted small">{c?.primary_phone ?? 'no phone'}</div></div></div></td>
                      <td><Link to={`/leads/${l.id}`} onClick={(e) => e.stopPropagation()}>{l.title}</Link></td>
                      <td><TempBadge t={l.temperature} empty="Not called" /></td>
                      <td>{uname(l.marketing_user_id) ?? <span className="muted">Not assigned</span>}</td>
                      <td className="nowrap" style={{ color: overdue(l) ? 'var(--red)' : undefined }}>{l.next_call_at ? <>{dateTime(l.next_call_at)}{overdue(l) && <div className="small">overdue</div>}</> : <span className="muted">—</span>}</td>
                      <td className="nowrap">{l.call_count}{l.last_call_at && <div className="muted small">last {ago(l.last_call_at)}</div>}</td>
                      <td className="small" style={{ maxWidth: 240 }}>{l.call_instruction ? <span className="row" style={{ gap: 4 }}><MessageSquareText size={14} style={{ flex: 'none' }} />{l.call_instruction}</span> : <span className="muted">—</span>}</td>
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
