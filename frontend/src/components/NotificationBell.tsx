// Last 20 notifications; opening one marks it read and navigates by entity_type (docs/features/NOTIFICATIONS.md).
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/api/queries';
import type { Notification } from '@/api/types';
import { ago } from '@/lib/format';
import { usePopover } from './ui';

const route = (n: Notification) => ({
  escalation: `/escalations?id=${n.entity_id}`,
  lead: `/leads/${n.entity_id}`,
  conversation: `/inbox/${n.entity_id}`,
  task: '/tasks',
  follow_up: '/followups',
}[n.entity_type]);

export function NotificationBell() {
  const { open, setOpen, ref } = usePopover();
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const nav = useNavigate();
  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-icon icon-btn" aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen(!open)}>
        <Bell />
        {unread > 0 && <span className="dot-badge">{unread}</span>}
      </button>
      {open && (
        <div className="popover" style={{ right: 0, top: 46, width: 360, zIndex: 40 }}>
          <div className="row-between" style={{ padding: '8px 10px' }}>
            <h3>Notifications</h3>
            {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={() => markAll.mutate(undefined)}><CheckCheck /> Mark all read</button>}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {items.length === 0 && <p className="muted" style={{ padding: 14 }}>You're all caught up.</p>}
            {items.map((n) => (
              <button key={n.id} className="ws-item" style={{ alignItems: 'flex-start' }}
                onClick={() => { if (!n.read_at) markRead.mutate(n.id); setOpen(false); nav(route(n)); }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, flex: 'none', background: n.read_at ? 'transparent' : 'var(--primary)' }} />
                <span className="grow">
                  <span className="row-between"><span className="strong">{n.title}</span><span className="muted small nowrap">{ago(n.created_at)}</span></span>
                  <span className="muted small">{n.body}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
