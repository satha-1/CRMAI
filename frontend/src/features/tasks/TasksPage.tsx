// Mockup 04 "Tasks": My / All tabs, grouped list (Today / Upcoming / Completed) and a detail pane.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Calendar, Check, CheckSquare, Flag, Plus, Target, User, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCreateTask, useCustomers, useTasks, useUpdateTask, useUsers } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Priority, Task, TaskStatus } from '@/api/types';
import { Avatar, Badge, EmptyState, Field, Loading, Modal, PageHeader, Segmented, useToast } from '@/components/ui';
import { dateTime, humanize, priorityTone, taskTone } from '@/lib/format';
import { Group, groupByDue } from '../followups/FollowUpsPage';

export function TasksPage() {
  const { has } = useAuth();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useTasks({ assignee: scope === 'mine' ? 'me' : undefined });
  const { data: customers } = useCustomers();
  const cname = useMemo(() => new Map(customers?.items.map((c) => [c.id, c.full_name])), [customers]);
  const update = useUpdateTask();
  const toast = useToast();
  const items = (data?.items ?? []).filter((t) => t.status !== 'cancelled');
  const g = groupByDue(items, (t) => t.due_at, (t) => t.status === 'done');
  const current = items.find((t) => t.id === selected) ?? g.Overdue[0] ?? g.Today[0] ?? g.Upcoming[0];

  const toggle = (t: Task) => update.mutate({ id: t.id, status: t.status === 'done' ? 'open' : 'done' }, {
    onSuccess: () => toast(t.status === 'done' ? 'Task reopened' : 'Task completed'), onError: (e) => toast(errorMessage(e), true),
  });

  const row = (t: Task) => {
    const done = t.status === 'done';
    const late = !done && t.due_at && new Date(t.due_at) < new Date();
    return (
      <div key={t.id} role="button" tabIndex={0} className={`list-item ${current?.id === t.id ? 'selected' : ''}`} onClick={() => setSelected(t.id)} onKeyDown={(e) => e.key === 'Enter' && setSelected(t.id)}>
        <button className={`check ${done ? 'on' : ''}`} aria-label={done ? 'Reopen task' : 'Complete task'} disabled={!has('task.write')} onClick={(e) => { e.stopPropagation(); toggle(t); }}>{done && <Check />}</button>
        <div className="grow">
          <div className={`strong ${done ? 'done-text' : ''}`}>{t.title}</div>
          <div className="row muted small" style={{ gap: 10 }}>
            {t.customer_id && <span className="row" style={{ gap: 4 }}><UserRound size={13} />{cname.get(t.customer_id)}</span>}
            <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
          </div>
        </div>
        {t.due_at && <Badge tone={late ? 'red' : done ? 'green' : 'purple'}>{dateTime(t.due_at)}</Badge>}
      </div>
    );
  };

  return (
    <div className="content">
      <PageHeader title="Tasks" actions={has('task.write') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> New task</button>} />
      <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My tasks' }, { value: 'all', label: 'All tasks' }]} />
      <div className="grid g-side-main" style={{ alignItems: 'start' }}>
        <section className="card card-pad stack">
          {isLoading ? <Loading /> : !items.length ? <EmptyState icon={<CheckSquare />} title="No tasks" /> : (
            <>
              <Group title="Overdue" items={g.Overdue} render={row} />
              <Group title="Today" items={g.Today} render={row} />
              <Group title="Upcoming" items={g.Upcoming} render={row} />
              <Group title="Completed" items={g.Completed} render={row} />
            </>
          )}
        </section>
        {current ? <TaskDetail t={current} customerName={current.customer_id ? cname.get(current.customer_id) : undefined} /> : <section className="card"><EmptyState title="Select a task" /></section>}
      </div>
      {creating && <TaskModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function TaskDetail({ t, customerName }: { t: Task; customerName?: string }) {
  const { has } = useAuth();
  const { data: users } = useUsers();
  const update = useUpdateTask();
  const toast = useToast();
  const patch = (b: Partial<Task>) => update.mutate({ id: t.id, ...b }, { onSuccess: () => toast('Task updated'), onError: (e) => toast(errorMessage(e), true) });
  const assignee = users?.items.find((u) => u.id === t.assigned_user_id)?.full_name;
  return (
    <section className="card card-pad stack" style={{ gap: 16 }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <button className={`check ${t.status === 'done' ? 'on' : ''}`} style={{ width: 28, height: 28, marginTop: 4 }} disabled={!has('task.write')}
          aria-label="Toggle complete" onClick={() => patch({ status: t.status === 'done' ? 'open' : 'done' })}>{t.status === 'done' && <Check />}</button>
        <h2 style={{ fontSize: 24 }} className={t.status === 'done' ? 'done-text' : ''}>{t.title}</h2>
      </div>
      <div className="row"><Badge tone="teal">Task</Badge>{t.customer_id && <Badge tone="purple">Customer-related</Badge>}{t.created_actor_type === 'ai_agent' && <Badge tone="purple"><Bot size={12} />Created by AI</Badge>}</div>
      <dl className="dl">
        <dt><User />Assignee</dt>
        <dd>{has('task.write') ? (
          <select className="select" value={t.assigned_user_id ?? ''} onChange={(e) => patch({ assigned_user_id: e.target.value || null })} aria-label="Assignee">
            <option value="">Unassigned</option>
            {users?.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        ) : assignee ? <span className="row"><Avatar name={assignee} size="sm" />{assignee}</span> : 'Unassigned'}</dd>
        <dt><Target />Status</dt>
        <dd>{has('task.write') ? (
          <select className="select" value={t.status} onChange={(e) => patch({ status: e.target.value as TaskStatus })} aria-label="Status">
            {(['open', 'in_progress', 'done', 'cancelled'] as TaskStatus[]).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        ) : <Badge tone={taskTone[t.status]}>{humanize(t.status)}</Badge>}</dd>
        <dt><Flag />Priority</dt><dd><Badge tone={priorityTone[t.priority]}>{humanize(t.priority)}</Badge></dd>
        <dt><Calendar />Due</dt><dd>{t.due_at ? <Badge tone="teal">{dateTime(t.due_at)}</Badge> : '—'}</dd>
        {t.customer_id && <><dt><UserRound />Customer</dt><dd><Link to={`/customers/${t.customer_id}`}>{customerName}</Link></dd></>}
      </dl>
      <div className="divider" />
      <h3>Details</h3>
      <p style={{ color: t.description ? 'var(--text-2)' : 'var(--muted)' }}>{t.description ?? 'No description.'}</p>
    </section>
  );
}

function TaskModal({ onClose }: { onClose: () => void }) {
  const { me } = useAuth();
  const { data: users } = useUsers();
  const { data: customers } = useCustomers();
  const create = useCreateTask();
  const toast = useToast();
  const [f, setF] = useState({ title: '', description: '', priority: 'medium' as Priority, due_at: '', customer_id: '', assigned_user_id: me?.id ?? '' });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="New task" onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ ...f, due_at: f.due_at ? new Date(f.due_at).toISOString() : null, customer_id: f.customer_id || null, assigned_user_id: f.assigned_user_id || null }, {
          onSuccess: () => { toast('Task created'); onClose(); }, onError: (x) => setErr(errorMessage(x)),
        });
      }}>
        <Field label="Title" className="full"><input className="input" value={f.title} onChange={set('title')} required minLength={3} maxLength={140} /></Field>
        <Field label="Priority">
          <select className="select" value={f.priority} onChange={set('priority')}>{(['low', 'medium', 'high', 'urgent'] as Priority[]).map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</select>
        </Field>
        <Field label="Due"><input className="input" type="datetime-local" value={f.due_at} onChange={set('due_at')} /></Field>
        <Field label="Customer (optional)">
          <select className="select" value={f.customer_id} onChange={set('customer_id')}><option value="">None</option>{customers?.items.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>
        </Field>
        <Field label="Assignee">
          <select className="select" value={f.assigned_user_id} onChange={set('assigned_user_id')}><option value="">Unassigned</option>{users?.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
        </Field>
        <Field label="Description" className="full"><textarea className="textarea" value={f.description} onChange={set('description')} /></Field>
        {err && <div className="error-text full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={create.isPending}>Create task</button>
        </div>
      </form>
    </Modal>
  );
}
