// Public chat widget (FRONTEND-ARCHITECTURE §16): one column of messages and a text box. Shows "AI" or
// "Staff" on outbound messages, never confidence or tools. The company is chosen by its widget key (?key=).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, UserRound } from 'lucide-react';
import { ApiError, USE_MOCK } from '@/api/client';
import type { Message, Page, WidgetSession } from '@/api/types';
import { time } from '@/lib/format';

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const KEY = new URLSearchParams(location.search).get('key') ?? import.meta.env.VITE_WIDGET_KEY ?? 'wk_northline_demo';
const SESSION_KEY = `crmai.widget.${KEY}`;

async function call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
  if (USE_MOCK) {
    const { mockRequest } = await import('@/api/mock/server');
    const sep = path.includes('?') ? '&' : '?';
    return mockRequest<T>(method, `${path}${sep}key=${encodeURIComponent(KEY)}`, body, { token: null, organizationId: null });
  }
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Widget-Key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? 'Chat is unavailable');
  return json as T;
}

const SUGGESTIONS = [
  'What are your support hours?',
  'I am interested in your premium package. Can someone contact me tomorrow? My name is Amina Shah and my email is amina@example.com',
  'I was charged incorrectly and I want a refund.',
  'This is not helping. I want a real person.',
];

function readSession(): WidgetSession | null {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? (JSON.parse(s) as WidgetSession) : null; } catch { return null; }
}

export function WidgetApp() {
  const [session, setSession] = useState<WidgetSession | null>(readSession);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [waiting, setWaiting] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const starting = useRef(false);

  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      const s = await call<WidgetSession>('POST', '/widget/session', {});
      setSession(s);
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chat is unavailable');
    } finally {
      starting.current = false;
    }
  }, []);

  useEffect(() => { if (!session) start(); }, [session, start]);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const r = await call<Page<Message>>('GET', `/widget/messages?visitor_session_id=${session.visitor_session_id}`);
      setMessages(r.items);
      const last = r.items[r.items.length - 1];
      setWaiting(!!last && last.direction === 'inbound' && Date.now() - new Date(last.created_at).getTime() < 8000);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
        setSession(null);
      }
    }
  }, [session]);

  // The real backend pushes on /ws/widget; polling is the documented fallback when the socket drops.
  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, waiting]);

  const send = async (content: string) => {
    if (!session || !content.trim()) return;
    setText(''); setErr(''); setWaiting(true);
    try {
      await call('POST', '/widget/messages', { visitor_session_id: session.visitor_session_id, content: content.trim() });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Message failed');
      setWaiting(false);
    }
  };

  const restart = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setMessages([]);
    setSession(null);
  };

  return (
    <div className="w-page">
      <div className="w-box" role="region" aria-label="Chat">
        <header className="w-head">
          <div className="w-logo"><Bot size={20} /></div>
          <div className="grow">
            <div className="strong">{session?.organization_name ?? 'Chat'}</div>
            <div className="small" style={{ opacity: 0.85 }}>AI assistant · a person takes over when needed</div>
          </div>
          <button className="w-link" onClick={restart}>New chat</button>
        </header>
        <div className="w-body" aria-live="polite">
          <div className="w-msg out">
            <span className="w-who"><Bot size={12} /> AI</span>
            <div className="w-bubble ai">Hi! How can we help you today?</div>
          </div>
          {messages.map((m) => (m.sender_type === 'system' ? (
            <div key={m.id} className="w-system">{m.content}</div>
          ) : (
            <div key={m.id} className={`w-msg ${m.direction === 'inbound' ? 'in' : 'out'}`}>
              {m.direction === 'outbound' && (
                <span className="w-who">{m.sender_type === 'staff' ? <><UserRound size={12} /> Staff</> : <><Bot size={12} /> AI</>}</span>
              )}
              <div className={`w-bubble ${m.direction === 'inbound' ? 'me' : m.sender_type === 'staff' ? 'staff' : 'ai'}`}>{m.content}</div>
              <span className="w-time">{time(m.created_at)}</span>
            </div>
          )))}
          {waiting && <div className="w-msg out"><div className="w-bubble ai w-typing"><span /><span /><span /></div></div>}
          {messages.length === 0 && USE_MOCK && (
            <div className="w-suggest">
              <span className="small muted">Try a demo scenario:</span>
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s.length > 70 ? `${s.slice(0, 70)}…` : s}</button>)}
            </div>
          )}
          <div ref={end} />
        </div>
        {err && <div className="alert alert-error" style={{ margin: '0 12px 8px' }}>{err}</div>}
        <form className="w-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label className="sr-only" htmlFor="w-text">Message</label>
          <input id="w-text" className="input" placeholder="Type your message…" value={text} onChange={(e) => setText(e.target.value)}
            maxLength={2000} disabled={!session} autoComplete="off" />
          <button className="btn btn-primary btn-icon" aria-label="Send" disabled={!session || !text.trim()}><Send /></button>
        </form>
        <div className="w-foot">Powered by CRMAI</div>
      </div>
    </div>
  );
}
