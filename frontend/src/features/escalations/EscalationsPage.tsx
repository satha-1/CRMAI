// docs/features/HUMAN-ESCALATION.md: queue with priority, age, SLA, customer, reason. Opening a row shows the
// conversation and Take over. Resolve requires notes and is enabled for the lock holder / supervisors.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlarmClock, CheckCircle2, Hand, MessageSquare, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useAssignEscalation, useEscalations, useMessages, useResolveEscalation, useTakeoverEscalation, useUsers, type EscalationRow } from '@/api/queries';
import { errorMessage } from '@/api/client';
import { Avatar, Badge, Card, Drawer, EmptyState, Field, Loading, PageHeader, Segmented, useToast } from '@/components/ui';
import { MessageThread } from '@/components/MessageThread';
import { ago, dateTime, escStatusTone, humanize, priorityTone, reasonLabel } from '@/lib/format';

type View = 'active' | 'mine' | 'unassigned' | 'resolved';
const VIEWS: Record<View, { status?: string; assignee?: string }> = {
  active: { status: 'open,assigned,in_progress' },
  mine: { status: 'open,assigned,in_progress', assignee: 'me' },
  unassigned: { status: 'open', assignee: 'unassigned' },
  resolved: { status: 'resolved,cancelled' },
};

export function EscalationsPage() {
  const [view, setView] = useState<View>('active');
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useEscalations(VIEWS[view]);
  const { data: all } = useEscalations({});
  const selectedId = params.get('id');
  const selected = all?.items.find((e) => e.id === selectedId);
  const items = data?.items ?? [];
  const overdue = items.filter((e) => e.status !== 'resolved' && new Date(e.sla_due_at) < new Date()).length;

  return (
    <div className="content">
      <PageHeader title="Escalations" sub="Conversations the AI handed to people. Highest priority first." />
      <div className="grid g-4">
        <Stat icon={<ShieldAlert />} tone="red" label="Active" value={(all?.items ?? []).filter((e) => ['open', 'assigned', 'in_progress'].includes(e.status)).length} />
        <Stat icon={<AlarmClock />} tone="amber" label="Past SLA" value={overdue} />
        <Stat icon={<Hand />} tone="blue" label="Unassigned" value={(all?.items ?? []).filter((e) => e.status === 'open' && !e.assigned_user_id).length} />
        <Stat icon={<ShieldCheck />} tone="green" label="Resolved" value={(all?.items ?? []).filter((e) => e.status === 'resolved').length} />
      </div>
      <Card pad={false} title={<Segmented value={view} onChange={setView} options={[
        { value: 'active', label: 'Active' }, { value: 'mine', label: 'Mine' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'resolved', label: 'Resolved' },
      ]} />}>
        <div style={{ height: 14 }} />
        {isLoading ? <Loading /> : !items.length ? <EmptyState icon={<CheckCircle2 />} title="Nothing here" body="No escalations match this view." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Priority</th><th>Customer</th><th>Reason</th><th>Status</th><th>Assignee</th><th>Age</th><th>SLA due</th></tr></thead>
              <tbody>
                {items.map((e) => {
                  const late = e.status !== 'resolved' && e.status !== 'cancelled' && new Date(e.sla_due_at) < new Date();
                  return (
                    <tr key={e.id} className={`clickable ${e.id === selectedId ? 'selected' : ''}`} onClick={() => setParams({ id: e.id })}>
                      <td><Badge tone={priorityTone[e.priority]}>{humanize(e.priority)}</Badge></td>
                      <td><div className="row"><Avatar name={e.customer_name} size="sm" /><span className="strong">{e.customer_name}</span></div></td>
                      <td>{reasonLabel[e.reason_code]}<div className="muted small">{humanize(e.triggered_by)}</div></td>
                      <td><Badge tone={escStatusTone[e.status]} dot>{humanize(e.status)}</Badge></td>
                      <td>{e.assigned_user_name ?? <span className="muted">Unassigned</span>}</td>
                      <td className="nowrap">{ago(e.created_at)}</td>
                      <td className="nowrap" style={{ color: late ? 'var(--red)' : undefined, fontWeight: late ? 600 : undefined }}>{late ? `Overdue ${ago(e.sla_due_at).replace(' ago', '')}` : dateTime(e.sla_due_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {selected && <EscalationDrawer e={selected} onClose={() => setParams({})} />}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="card card-pad row" style={{ gap: 14 }}>
      <span className="kpi-icon" style={{ background: `var(--${tone}-50)`, color: `var(--${tone === 'blue' ? 'primary' : tone})` }}>{icon}</span>
      <div><div className="muted">{label}</div><div className="kpi-value" style={{ fontSize: 26 }}>{value}</div></div>
    </div>
  );
}

function EscalationDrawer({ e, onClose }: { e: EscalationRow; onClose: () => void }) {
  const { me, has } = useAuth();
  const toast = useToast();
  const { data: msgs } = useMessages(e.conversation_id);
  const { data: users } = useUsers();
  const takeover = useTakeoverEscalation();
  const assign = useAssignEscalation();
  const resolve = useResolveEscalation();
  const [notes, setNotes] = useState('');
  const active = ['open', 'assigned', 'in_progress'].includes(e.status);
  const canResolve = active && (e.assigned_user_id === me?.id || has('escalation.assign'));
  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok)).catch((x) => toast(errorMessage(x), true));

  return (
    <Drawer onClose={onClose} label="Escalation detail">
      <div className="stack-sm">
        <div className="row wrap">
          <Badge tone={priorityTone[e.priority]}>{humanize(e.priority)}</Badge>
          <Badge tone={escStatusTone[e.status]} dot>{humanize(e.status)}</Badge>
        </div>
        <h2 style={{ fontSize: 22 }}>{e.customer_name}</h2>
        <p><b>{reasonLabel[e.reason_code]}.</b> {e.reason_detail}</p>
        <p className="muted small">Opened {dateTime(e.created_at)} by {humanize(e.triggered_by)} · SLA {dateTime(e.sla_due_at)}</p>
      </div>
      {active && (
        <div className="row wrap">
          {has('conversation.takeover') && e.assigned_user_id !== me?.id && (
            <button className="btn btn-primary" onClick={() => run(takeover.mutateAsync(e.id), 'You took over this conversation')}><Hand /> Take over</button>
          )}
          <Link className="btn" to={`/inbox/${e.conversation_id}`}><MessageSquare /> Open conversation</Link>
        </div>
      )}
      {active && has('escalation.assign') && (
        <Field label="Assign to">
          <select className="select" value={e.assigned_user_id ?? ''} onChange={(x) => x.target.value && run(assign.mutateAsync({ id: e.id, user_id: x.target.value }), 'Assigned')}>
            <option value="">Unassigned</option>
            {users?.items.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
          </select>
        </Field>
      )}
      <Card title="Conversation" pad={false}>
        <div style={{ maxHeight: 340, overflowY: 'auto', background: 'var(--bg)' }}>
          <MessageThread messages={msgs?.items ?? []} customerName={e.customer_name} />
        </div>
      </Card>
      {e.status === 'resolved' && <div className="alert alert-info"><CheckCircle2 /><div><b>Resolution notes</b><br />{e.resolution_notes}</div></div>}
      {canResolve && (
        <form className="stack" onSubmit={(x) => { x.preventDefault(); run(resolve.mutateAsync({ id: e.id, resolution_notes: notes }), 'Escalation resolved'); }}>
          <Field label="Resolution notes (internal)" hint="Required. Stored as staff-only and never sent to the AI.">
            <textarea className="textarea" value={notes} onChange={(x) => setNotes(x.target.value)} required maxLength={2000} />
          </Field>
          <p className="muted small">Resolving does not turn the AI back on. Use “Release to AI” in the conversation when it's safe.</p>
          <button className="btn btn-primary" disabled={!notes.trim() || resolve.isPending}><CheckCircle2 /> Resolve</button>
        </form>
      )}
    </Drawer>
  );
}
