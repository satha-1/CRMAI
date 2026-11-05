// Bubbles for customer, AI and staff; system (escalation) messages are visually distinct.
import { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';
import type { Message } from '@/api/types';
import { time } from '@/lib/format';

export function MessageThread({ messages, customerName }: { messages: Message[]; customerName?: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);
  return (
    <div className="thread" aria-live="polite">
      {messages.map((m) => {
        const kind = m.sender_type === 'system' ? 'sys' : m.direction === 'inbound' ? 'in' : 'out';
        const who = m.sender_type === 'customer' ? customerName ?? 'Customer'
          : m.sender_type === 'ai_agent' ? 'AI agent' : m.sender_type === 'staff' ? m.sender_name ?? 'Staff' : 'System';
        return (
          <div key={m.id} className={`bubble-row ${kind}`}>
            {kind !== 'sys' && (
              <span className="bubble-meta">
                {m.sender_type === 'ai_agent' ? <Bot size={13} /> : <User size={13} />}
                {who} · {time(m.created_at)}
              </span>
            )}
            <div className={`bubble ${m.sender_type}`}>{m.content}</div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
