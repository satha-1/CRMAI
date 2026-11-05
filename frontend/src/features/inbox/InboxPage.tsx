// FRONTEND-ARCHITECTURE §10: left inbox filters (open, pending human, mine), right thread with a
// TakeoverBar, composer disabled when locked by someone else, side panel with AI decision metadata.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Hand, Inbox as InboxIcon, Lock, MessageSquarePlus, Send, ShieldAlert, Unlock, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import {
  useAiActions, useConversation, useConversations, useCreateEscalation, useCustomer, useLeads, useMessages, useRelease, useSendMessage, useTakeover,
} from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Conversation } from '@/api/types';
import { Avatar, Badge, EmptyState, Field, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { MessageThread } from '@/components/MessageThread';
import { ago, channelName, convTone, humanize, leadTone, money, pct, reasonLabel, time } from '@/lib/format';

type Filter = 'open' | 'pending' | 'mine' | 'all';
const FILTERS: Record<Filter, { status?: string; assigned?: string }> = {
  open: { status: 'open,pending_human,assigned' },
  pending: { status: 'pending_human' },
  mine: { assigned: 'me' },
  all: {},
};

export function InboxPage() {
  const { id } = useParams();
  const [filter, setFilter] = useState<Filter>('open');
  const [q, setQ] = useState('');
  const { data, isLoading } = useConversations(FILTERS[filter]);
  const items = (data?.items ?? []).filter((c) => !q || c.customer_name?.toLowerCase().includes(q.toLowerCase()) || c.last_message_preview?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className={`inbox ${id ? 'has-thread' : ''}`}>
      <div className="inbox-list">
        <div className="inbox-filters">
          <div className="row-between"><h2>Inbox</h2><span className="muted small">{items.length} conversations</span></div>
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'open', label: 'Open' }, { value: 'pending', label: 'Waiting' }, { value: 'mine', label: 'Mine' }, { value: 'all', label: 'All' },
          ]} />
          <input className="input" placeholder="Search name or message…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
        </div>
        <div className="inbox-items">
          {isLoading && <Loading />}
          {!isLoading && !items.length && <EmptyState icon={<InboxIcon />} title="No conversations" body="New website chats appear here." />}
          {items.map((c) => <InboxRow key={c.id} c={c} active={c.id === id} />)}
        </div>
      </div>
      {id ? <ConversationView id={id} /> : (
        <div className="thread-col" style={{ display: 'grid', placeItems: 'center' }}>
          <EmptyState icon={<MessageSquarePlus />} title="Select a conversation" body="Pick a thread to see the messages, the AI's decisions and take over if needed." />
        </div>
      )}
    </div>
  );
}

function InboxRow({ c, active }: { c: Conversation; active: boolean }) {
  return (
    <Link to={`/inbox/${c.id}`} className={`inbox-item ${active ? 'active' : ''}`}>
      <Avatar name={c.customer_name} />
      <div style={{ minWidth: 0 }}>
        <div className="row-between">
          <span className="strong ellipsis">{c.customer_name}</span>
          <span className="muted small nowrap">{ago(c.last_message_at)}</span>
        </div>
        <div className="muted small ellipsis">{c.last_message_preview}</div>
        <div className="row" style={{ marginTop: 5, gap: 6 }}>
          <Badge tone={convTone[c.status]}>{humanize(c.status)}</Badge>
          {c.ai_enabled ? <Badge tone="purple"><Bot size={12} />AI on</Badge> : <Badge tone="amber"><Hand size={12} />Human</Badge>}
          <span className="muted small">{channelName[c.channel]}</span>
          {c.simulated && <Badge tone="gray">Simulated</Badge>}
        </div>
      </div>
    </Link>
  );
}

function ConversationView({ id }: { id: string }) {
  const { me, has } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data: c, isLoading, error } = useConversation(id);
  const { data: msgs } = useMessages(id);
  const takeover = useTakeover();
  const release = useRelease();
  const send = useSendMessage();
  const [text, setText] = useState('');
  const [escalating, setEscalating] = useState(false);

  if (isLoading) return <div className="thread-col"><Loading /></div>;
  if (error || !c) return <div className="thread-col"><EmptyState title="Conversation not found" body={errorMessage(error)} /></div>;

  const mine = c.locked_by_user_id === me?.id;
  const lockedByOther = !!c.locked_by_user_id && !mine;
  const canSend = has('conversation.reply') && !lockedByOther;
  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok)).catch((e) => toast(errorMessage(e), true));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    send.mutate({ conversation_id: c.id, content: text.trim() }, {
      onSuccess: () => setText(''),
      onError: (x) => toast(errorMessage(x), true),
    });
  };

  return (
    <>
      <div className="thread-col">
        <div className="thread-head row-between">
          <div className="row">
            <button className="btn btn-ghost btn-icon btn-sm mobile-only" onClick={() => nav('/inbox')} aria-label="Back"><ArrowLeft /></button>
            <Avatar name={c.customer_name} />
            <div>
              <Link to={`/customers/${c.customer_id}`} className="strong">{c.customer_name}</Link>
              <div className="muted small">{channelName[c.channel]}{c.subject ? ` · ${c.subject}` : ''}</div>
            </div>
          </div>
          <Badge tone={convTone[c.status]} dot>{humanize(c.status)}</Badge>
        </div>

        {/* TakeoverBar */}
        {c.ai_enabled ? (
          <div className="takeover ai">
            <Bot size={18} color="var(--purple)" />
            <span className="grow"><b>AI is handling this conversation.</b> It replies automatically and escalates when the policy requires.</span>
            {has('conversation.reply') && <button className="btn btn-sm" onClick={() => setEscalating(true)}><ShieldAlert /> Escalate</button>}
            {has('conversation.takeover') && <button className="btn btn-sm btn-primary" onClick={() => run(takeover.mutateAsync(c.id), 'You took over — AI is off')}><Hand /> Take over</button>}
          </div>
        ) : mine ? (
          <div className="takeover mine">
            <Lock size={18} color="var(--green)" />
            <span className="grow"><b>You are handling this conversation.</b> AI is off. Other staff can't reply.</span>
            <button className="btn btn-sm" onClick={() => run(release.mutateAsync(c.id), 'Released — AI will reply to new messages')}><Unlock /> Release to AI</button>
          </div>
        ) : lockedByOther ? (
          <div className="takeover human">
            <Lock size={18} color="var(--amber)" />
            <span className="grow"><b>{c.locked_by_name}</b> is handling this conversation. AI is off.</span>
            {has('escalation.assign') && <button className="btn btn-sm" onClick={() => run(takeover.mutateAsync(c.id), 'Lock transferred to you')}>Transfer to me</button>}
          </div>
        ) : (
          <div className="takeover human">
            <Hand size={18} color="var(--amber)" />
            <span className="grow"><b>Waiting for a human.</b> The AI stopped and handed this conversation to staff.</span>
            {has('conversation.takeover') && <button className="btn btn-sm btn-primary" onClick={() => run(takeover.mutateAsync(c.id), 'You took over')}><Hand /> Take over</button>}
          </div>
        )}

        <MessageThread messages={msgs?.items ?? []} customerName={c.customer_name} />

        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="reply">Reply</label>
          <textarea id="reply" className="textarea grow" rows={1} placeholder={lockedByOther ? `Locked by ${c.locked_by_name}` : c.ai_enabled ? 'Reply as staff (AI stays on until you take over)…' : 'Write a reply…'}
            value={text} onChange={(e) => setText(e.target.value)} disabled={!canSend} maxLength={4000}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }} />
          <button className="btn btn-primary" disabled={!canSend || !text.trim() || send.isPending}><Send /> Send</button>
        </form>
      </div>
      <AiSidePanel c={c} />
      {escalating && <EscalateModal conversationId={c.id} onClose={() => setEscalating(false)} />}
    </>
  );
}

function AiSidePanel({ c }: { c: Conversation }) {
  const { data: actions } = useAiActions(c.id);
  const { data: customer } = useCustomer(c.customer_id);
  const { data: leads } = useLeads({ customer_id: c.customer_id });
  const latest = actions?.items[0];
  return (
    <aside className="side-panel" aria-label="AI and customer details">
      <section className="stack-sm">
        <h3 className="row"><UserRound size={16} /> Customer</h3>
        <div className="small">
          <div className="strong">{customer?.full_name}</div>
          <div className="muted">{customer?.primary_email ?? 'No email yet'}</div>
          <div className="muted">{customer?.primary_phone}</div>
          {customer?.status === 'provisional' && <Badge tone="amber">Provisional</Badge>}
        </div>
        {leads?.items.map((l) => (
          <Link key={l.id} to={`/leads/${l.id}`} className="ai-row" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="row-between"><span className="strong">{l.title}</span>{l.estimated_value ? <span className="money">{money(l.estimated_value)}</span> : null}</div>
            <Badge tone={leadTone[l.status]}>{l.status}</Badge>
          </Link>
        ))}
      </section>
      <div className="divider" />
      <section className="stack-sm">
        <h3 className="row"><Bot size={16} /> AI decisions</h3>
        {latest ? (
          <div className="ai-row" style={{ background: 'var(--surface-2)' }}>
            <span className="muted small">Latest intent</span>
            <span className="strong">{humanize(latest.intent)}</span>
            <span className="muted small">Confidence {pct(latest.confidence_final)}</span>
            <div className="conf"><span style={{ width: pct(latest.confidence_final), background: latest.confidence_final >= 0.7 ? 'var(--teal)' : 'var(--amber)' }} /></div>
            {latest.decision === 'escalate' && <Badge tone="red">Escalated: {latest.escalation_reason ? reasonLabel[latest.escalation_reason as keyof typeof reasonLabel] ?? latest.escalation_reason : ''}</Badge>}
          </div>
        ) : <p className="muted small">No AI turns yet.</p>}
        {actions?.items.filter((a) => a.tool_name).map((a, i) => (
          <div key={i} className="ai-row">
            <div className="row-between">
              <code className="small">{a.tool_name}</code>
              <Badge tone={a.tool_status === 'success' ? 'green' : a.tool_status === 'denied' ? 'red' : 'gray'}>{a.tool_status}</Badge>
            </div>
            <span className="muted small">{humanize(a.intent)} · {pct(a.confidence_final)} · {time(a.created_at)}</span>
          </div>
        ))}
        <p className="muted small">Tool arguments are hidden by design — the panel shows what the AI did, not its raw prompt.</p>
      </section>
    </aside>
  );
}

function EscalateModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const create = useCreateEscalation();
  const toast = useToast();
  const [priority, setPriority] = useState('medium');
  const [detail, setDetail] = useState('');
  return (
    <Modal title="Escalate to the human queue" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-danger" disabled={create.isPending || !detail.trim()} onClick={() =>
        create.mutate({ conversation_id: conversationId, priority, reason_detail: detail }, {
          onSuccess: () => { toast('Escalated — AI is now off'); onClose(); },
          onError: (e) => toast(errorMessage(e), true),
        })}>Escalate</button>
    </>}>
      <p className="muted">This turns the AI off for the conversation and puts it in the escalation queue.</p>
      <Field label="Priority">
        <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="urgent">Urgent — 15 min SLA</option><option value="high">High — 1 hour</option>
          <option value="medium">Medium — 4 hours</option><option value="low">Low — 1 business day</option>
        </select>
      </Field>
      <Field label="Reason"><textarea className="textarea" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Why does a person need to handle this?" /></Field>
    </Modal>
  );
}
