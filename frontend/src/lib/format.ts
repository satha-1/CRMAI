import type {
  CallOutcome, ChannelCode, ConversationStatus, Temperature, VisitOutcome, VisitStatus, EscalationReason, EscalationStatus, FollowUpStatus, LeadStatus, Priority, TaskStatus,
} from '@/api/types';

export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export const hashIndex = (s: string, mod: number) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % mod;
};

export function money(v: number | null | undefined, compact = true) {
  if (v === null || v === undefined) return '—';
  if (compact && v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (compact && v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v.toLocaleString()}`;
}
export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export function dateShort(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function dateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const tm = new Date(now); tm.setDate(now.getDate() + 1);
  const yd = new Date(now); yd.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `Today, ${time(iso)}`;
  if (sameDay(d, tm)) return `Tomorrow, ${time(iso)}`;
  if (sameDay(d, yd)) return `Yesterday, ${time(iso)}`;
  return `${dateShort(iso)}, ${time(iso)}`;
}
export function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(s);
  const unit = abs < 60 ? [abs, 's'] : abs < 3600 ? [Math.round(abs / 60), 'm'] : abs < 86400 ? [Math.round(abs / 3600), 'h'] : [Math.round(abs / 86400), 'd'];
  return s >= 0 ? `${unit[0]}${unit[1]} ago` : `in ${unit[0]}${unit[1]}`;
}
export function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

type Tone = 'blue' | 'teal' | 'purple' | 'amber' | 'red' | 'green' | 'gray';
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'site_visit', 'negotiation', 'converted', 'lost', 'unqualified'];
export const leadLabel: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Called', qualified: 'With sales', site_visit: 'Site visit', negotiation: 'Negotiation',
  converted: 'Converted', lost: 'Lost', unqualified: 'Unqualified',
};
export const leadTone: Record<LeadStatus, Tone> = { new: 'teal', contacted: 'blue', qualified: 'purple', site_visit: 'amber', negotiation: 'amber', unqualified: 'gray', converted: 'green', lost: 'red' };
export const leadColor: Record<LeadStatus, string> = { new: '#14a38b', contacted: '#1d5bff', qualified: '#7c4dff', site_visit: '#e69a1c', negotiation: '#c2410c', unqualified: '#94a3b8', converted: '#15905a', lost: '#dc3b3b' };

export const tempTone: Record<Temperature, Tone> = { hot: 'red', warm: 'amber', cold: 'blue' };
export const tempColor: Record<Temperature, string> = { hot: '#dc3b3b', warm: '#e69a1c', cold: '#1d5bff' };
export const callOutcomeLabel: Record<CallOutcome, string> = { answered: 'Answered', no_answer: 'No answer', busy: 'Busy', wrong_number: 'Wrong number', call_back: 'Asked to call back' };
export const visitStatusTone: Record<VisitStatus, Tone> = { scheduled: 'blue', on_the_way: 'purple', checked_in: 'amber', completed: 'green', cancelled: 'gray', no_show: 'red' };
export const visitStatusLabel: Record<VisitStatus, string> = { scheduled: 'Scheduled', on_the_way: 'On the way', checked_in: 'At the site', completed: 'Report done', cancelled: 'Cancelled', no_show: "Customer didn't come" };
export const visitOutcomeLabel: Record<VisitOutcome, string> = { booked: 'Booked / bought', negotiating: 'Negotiating price', interested: 'Interested, needs another visit', not_interested: 'Not interested' };
export const interestLabel = { high: 'High', medium: 'Medium', low: 'Low' } as const;
export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const timeOnly = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const priorityTone: Record<Priority, Tone> = { urgent: 'red', high: 'amber', medium: 'blue', low: 'gray' };
export const escStatusTone: Record<EscalationStatus, Tone> = { open: 'red', assigned: 'amber', in_progress: 'blue', resolved: 'green', cancelled: 'gray' };
export const convTone: Record<ConversationStatus, Tone> = { open: 'teal', pending_human: 'red', assigned: 'amber', resolved: 'green', closed: 'gray' };
export const followTone: Record<FollowUpStatus, Tone> = { scheduled: 'blue', completed: 'green', cancelled: 'gray', missed: 'red' };
export const taskTone: Record<TaskStatus, Tone> = { open: 'blue', in_progress: 'amber', done: 'green', cancelled: 'gray' };
export const channelName: Record<ChannelCode, string> = { website: 'Website', email: 'Email', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', voice: 'Voice' };

/** Label rules: ANALYTICS.md says the AI rate must read "AI handled without escalation". */
export const reasonLabel: Record<EscalationReason, string> = {
  low_confidence: 'Low confidence', human_requested: 'Customer asked for a person', sensitive_complaint: 'Sensitive complaint',
  billing_requires_human: 'Billing requires human', tool_not_permitted: 'Tool not permitted', repeated_failure: 'Repeated failure',
  identity_conflict: 'Identity conflict', policy_approval: 'Needs policy approval', llm_unavailable: 'AI unavailable',
  model_output_invalid: 'Invalid AI output', ungrounded_claim: 'Ungrounded claim', data_store_unavailable: 'Data store unavailable',
  staff_requested: 'Staff requested',
};
