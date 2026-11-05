// Customer journey (docs/features/CUSTOMER-JOURNEY.md §3). Sorted ascending, actor + channel per row.
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, CalendarCheck, CalendarClock, CheckCircle2, Flag, Handshake, LifeBuoy, MessageSquare,
  Repeat, ShoppingBag, Sparkles, UserPlus, UserCog,
} from 'lucide-react';
import type { JourneyEvent, TimelineItem } from '@/api/types';
import { channelName, dateTime, humanize } from '@/lib/format';
import { EmptyState } from './ui';

const ICON: Record<JourneyEvent, [typeof Flag, string, string]> = {
  first_contact: [UserPlus, '#e0f2fe', '#0369a1'],
  inquiry: [MessageSquare, '#e8efff', '#1d5bff'],
  lead_created: [Sparkles, '#efe8ff', '#5b30d6'],
  qualification: [BadgeCheck, '#efe8ff', '#5b30d6'],
  follow_up_scheduled: [CalendarClock, '#dcf5ef', '#0c7a66'],
  follow_up_completed: [CalendarCheck, '#dcf5ef', '#0c7a66'],
  conversion: [Handshake, '#dcf3e7', '#15905a'],
  purchase: [ShoppingBag, '#dcf3e7', '#15905a'],
  support: [LifeBuoy, '#e8efff', '#1d5bff'],
  complaint: [Flag, '#fde6e6', '#b42323'],
  escalation: [AlertTriangle, '#fff1d6', '#9a5c06'],
  resolution: [CheckCircle2, '#dcf3e7', '#15905a'],
  channel_switch: [Repeat, '#e0f2fe', '#0369a1'],
  profile_updated: [UserCog, '#eef1f6', '#475569'],
};

export function Timeline({ items, compact }: { items: TimelineItem[]; compact?: boolean }) {
  if (!items.length) return <EmptyState title="No journey events yet" />;
  const list = compact ? items.slice(-6) : items;
  return (
    <ol className="timeline">
      {list.map((e) => {
        const [Icon, bg, fg] = ICON[e.event_type] ?? ICON.inquiry;
        const actor = e.actor_type === 'ai_agent' ? 'AI agent' : e.actor_type === 'system' ? 'System' : e.actor_name ?? 'Staff';
        return (
          <li key={e.id}>
            <span className="tl-icon" style={{ background: bg, color: fg }}><Icon /></span>
            <div>
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <span className="tl-title">{humanize(e.event_type)}</span>
                <span className="tl-meta nowrap">{dateTime(e.occurred_at)}</span>
              </div>
              <div style={{ color: 'var(--text-2)' }}>{e.summary}</div>
              <div className="tl-meta">
                {actor}{e.channel ? ` · ${channelName[e.channel]}` : ''}
                {e.visibility === 'staff' && ' · Internal'}
                {e.conversation_id && <> · <Link to={`/inbox/${e.conversation_id}`}>Conversation</Link></>}
                {e.lead_id && <> · <Link to={`/leads/${e.lead_id}`}>Lead</Link></>}
                {e.escalation_id && <> · <Link to={`/escalations?id=${e.escalation_id}`}>Escalation</Link></>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
