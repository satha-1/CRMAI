// In-browser mock of the FastAPI backend described in docs/api/API-SPECIFICATION.md.
// Persisted in localStorage so the staff console and widget.html (another tab) share state.
// Replace by setting VITE_USE_MOCK=false once the backend serves /api/v1.
import type {
  ExecPerformance,
  AgentStats, CallLog, ChannelCode, SiteVisit, Team, TeamMemberLoad, Conversation, Customer, Dashboard, Escalation, FollowUp, KnowledgeDocument,
  Lead, LoginResponse, Me, Message, Organization, Permission, Priority, Role, Task, TimelineItem,
} from '../types';
import { buildSeed, iso, uid, type DB, type MockUser } from './seed';
import { runFakeAgent } from './agent';

const KEY = 'crmai.mockdb';
const H = 3600_000;
/** docs/features/ANALYTICS.md: configuration constant, default 5000. */
const HIGH_VALUE_LEAD = 5000;
let db: DB = load();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === buildSeed().version) return parsed;
    }
  } catch { /* fall through */ }
  return buildSeed();
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore quota / private mode */ }
}
export function resetMockDb() {
  db = buildSeed();
  save();
}
export const getDb = () => db;
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) db = load(); });
}

import { executiveRole, isExecutive, isManager, managerRole, permissionsFor } from '@/auth/permissions';

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new HttpError(status, code, message); };

interface Ctx { user: MockUser; org: Organization; role: Role; perms: Permission[] }
const need = (ctx: Ctx, p: Permission) => { if (!ctx.perms.includes(p)) fail(403, 'FORBIDDEN', 'You do not have permission to do that'); };

const userName = (id: string | null) => (id ? db.users.find((u) => u.id === id)?.full_name ?? null : null);
const customerName = (id: string) => db.customers.find((c) => c.id === id)?.full_name ?? 'Unknown';
const page = <T,>(items: T[]) => ({ items, next_cursor: null });

function decorate(c: Conversation): Conversation {
  const last = [...db.messages].reverse().find((m) => m.conversation_id === c.id);
  return { ...c, customer_name: customerName(c.customer_id), last_message_preview: last?.content ?? '',
    assigned_user_name: userName(c.assigned_user_id), locked_by_name: userName(c.locked_by_user_id) };
}

export function journey(org: string, customer_id: string, event_type: TimelineItem['event_type'], summary: string,
  actor_type: TimelineItem['actor_type'], extra: Partial<TimelineItem> = {}) {
  db.timeline.push({ id: uid('evt'), organization_id: org, customer_id, event_type, summary, occurred_at: new Date().toISOString(),
    channel: 'website', actor_type, actor_name: actor_type === 'ai_agent' ? 'AI agent' : null, visibility: 'customer_safe', ...extra });
}
export function notify(org: string, filter: (role: Role, userId: string) => boolean, n: { type: any; title: string; body: string; entity_type: any; entity_id: string }) {
  for (const u of db.users) {
    const m = u.memberships.find((x) => x.organization_id === org);
    if (m && u.is_active && filter(m.role, u.id)) {
      db.notifications.push({ id: uid('ntf'), organization_id: org, user_id: u.id, read_at: null, created_at: new Date().toISOString(), ...n });
    }
  }
}
const SLA_HOURS: Record<Priority, number> = { urgent: 0.25, high: 1, medium: 4, low: 24 };
export function openEscalation(conv: Conversation, reason_code: Escalation['reason_code'], priority: Priority,
  triggered_by: Escalation['triggered_by'], reason_detail: string): Escalation {
  const active = db.escalations.find((e) => e.conversation_id === conv.id && ['open', 'assigned', 'in_progress'].includes(e.status));
  if (active) return active;
  const e: Escalation = { id: uid('esc'), organization_id: conv.organization_id, conversation_id: conv.id, customer_id: conv.customer_id,
    reason_code, reason_detail, priority, status: 'open', triggered_by, assigned_user_id: null,
    sla_due_at: iso(SLA_HOURS[priority]), created_at: new Date().toISOString(), resolved_at: null };
  db.escalations.push(e);
  conv.ai_enabled = false;
  conv.status = 'pending_human';
  journey(conv.organization_id, conv.customer_id, 'escalation', `Escalated: ${reason_code.replace(/_/g, ' ')} (${priority})`,
    triggered_by === 'staff' ? 'user' : 'ai_agent', { escalation_id: e.id, conversation_id: conv.id });
  notify(conv.organization_id, (role) => (priority === 'high' || priority === 'urgent' ? isManager(role) : role !== 'sales_executive'),
    { type: 'ai_escalation', title: `${priority[0].toUpperCase()}${priority.slice(1)} escalation`, body: `${customerName(conv.customer_id)}: ${reason_code.replace(/_/g, ' ')}`, entity_type: 'escalation', entity_id: e.id });
  return e;
}

// ---------- routing ----------
type Handler = (ctx: Ctx, p: string[], body: any, q: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), h]);

export async function mockRequest<T>(method: string, fullPath: string, body: unknown,
  auth: { token: string | null; organizationId: string | null }): Promise<T> {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); // feel like a network
  db = load();
  const [path, query = ''] = fullPath.split('?');
  const q = new URLSearchParams(query);
  try {
    const pub = publicRoute(method, path, body, q);
    if (pub !== NOT_PUBLIC) { save(); return structuredClone(pub) as T; }
    const userId = auth.token?.startsWith('mock.') ? auth.token.slice(5) : null;
    const user = db.users.find((u) => u.id === userId && u.is_active);
    if (!user) fail(401, 'AUTH_INVALID', 'Please sign in');
    const u = user!;
    if (path === '/auth/me' || path === '/organizations' ) {
      const res = handleAccount(method, path, u, body);
      save();
      return structuredClone(res) as T;
    }
    const membership = u.memberships.find((m) => m.organization_id === auth.organizationId) ?? u.memberships[0];
    if (!membership) fail(403, 'FORBIDDEN', 'You are not a member of any workspace');
    const org = db.orgs.find((o) => o.id === membership.organization_id)!;
    const ctx: Ctx = { user: u, org, role: membership.role, perms: permissionsFor(membership.role) };
    for (const [m, re, h] of routes) {
      const match = method === m ? path.match(re) : null;
      if (match) {
        const res = h(ctx, match.slice(1), body ?? {}, q);
        save();
        return structuredClone(res ?? null) as T;
      }
    }
    fail(404, 'NOT_FOUND', `No mock route for ${method} ${path}`);
  } catch (e) {
    const { ApiError } = await import('../client');
    if (e instanceof HttpError) throw new ApiError(e.status, e.code, e.message);
    throw e;
  }
  throw new Error('unreachable');
}

const NOT_PUBLIC = Symbol('np');
function publicRoute(method: string, path: string, body: any, q: URLSearchParams): unknown {
  if (method === 'POST' && path === '/auth/login') {
    const u = db.users.find((x) => x.email.toLowerCase() === String(body?.email ?? '').toLowerCase());
    if (!u || u.password !== body?.password || !u.is_active) fail(401, 'AUTH_INVALID', 'Email or password is incorrect');
    const r: LoginResponse = { access_token: `mock.${u!.id}`, refresh_token: `mockr.${u!.id}`, expires_in: 900, user: { id: u!.id, full_name: u!.full_name, role: u!.role } };
    return r;
  }
  if (method === 'POST' && path === '/auth/refresh') {
    const id = String(body?.refresh_token ?? '').replace('mockr.', '');
    const u = db.users.find((x) => x.id === id && x.is_active);
    if (!u) fail(401, 'AUTH_REVOKED', 'Session expired, please sign in again');
    return { access_token: `mock.${u!.id}`, refresh_token: `mockr.${u!.id}`, expires_in: 900, user: { id: u!.id, full_name: u!.full_name, role: u!.role } };
  }
  if (method === 'POST' && path === '/auth/logout') return null;
  if (method === 'POST' && path === '/auth/signup') {
    // SaaS self-service: create a company workspace and its first admin.
    const { company_name, industry, full_name, email, password } = body ?? {};
    if (!company_name || !full_name || !email) fail(400, 'VALIDATION_ERROR', 'Company, name and email are required');
    if (String(password ?? '').length < 10) fail(400, 'VALIDATION_ERROR', 'Password must be at least 10 characters');
    if (db.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) fail(409, 'CONFLICT', 'An account with that email already exists');
    const org = createOrg(company_name, industry);
    const u: MockUser = { id: uid('u'), email, full_name, role: 'admin', is_active: true, created_at: new Date().toISOString(), password,
      memberships: [{ organization_id: org.id, role: 'admin' }] };
    db.users.push(u);
    return { access_token: `mock.${u.id}`, refresh_token: `mockr.${u.id}`, expires_in: 900, user: { id: u.id, full_name, role: 'admin' }, organization_id: org.id };
  }
  // ---- public widget (X-Widget-Key is the org's widget_key, passed as ?key=) ----
  if (path.startsWith('/widget/')) {
    const key = q.get('key') ?? body?.widget_key;
    const org = db.orgs.find((o) => o.widget_key === key);
    if (!org) fail(401, 'AUTH_INVALID', 'Unknown widget key');
    if (method === 'POST' && path === '/widget/session') {
      const now = new Date().toISOString();
      const c: Customer = { id: uid('cus'), organization_id: org!.id, full_name: `Website visitor ${Math.random().toString(16).slice(2, 6)}`, primary_email: null, primary_phone: null,
        status: 'provisional', company_name: null, preferred_channel: 'website', notes: '', owner_user_id: null, created_at: now, updated_at: now };
      db.customers.push(c);
      journey(org!.id, c.id, 'first_contact', 'First contact on website chat', 'system');
      const cv: Conversation = { id: uid('cnv'), organization_id: org!.id, customer_id: c.id, channel: 'website', status: 'open', assigned_user_id: null,
        assigned_user_name: null, ai_enabled: true, locked_by_user_id: null, locked_by_name: null, subject: null, last_message_at: now };
      db.conversations.push(cv);
      const s = { id: uid('vs'), organization_id: org!.id, customer_id: c.id, conversation_id: cv.id };
      db.widget_sessions.push(s);
      return { visitor_session_id: s.id, conversation_id: cv.id, customer_id: c.id, organization_name: org!.name };
    }
    const s = db.widget_sessions.find((x) => x.id === (q.get('visitor_session_id') ?? body?.visitor_session_id) && x.organization_id === org!.id);
    if (!s) fail(404, 'NOT_FOUND', 'Chat session expired');
    if (method === 'GET' && path === '/widget/messages') {
      return page(db.messages.filter((m) => m.conversation_id === s!.conversation_id)
        .map(({ id, direction, sender_type, content, created_at, message_type }) => ({ id, direction, sender_type, content, created_at, message_type })));
    }
    if (method === 'POST' && path === '/widget/messages') {
      const content = String(body?.content ?? '').trim();
      if (!content || content.length > 2000) fail(400, 'VALIDATION_ERROR', 'Message must be 1–2000 characters');
      const conv = db.conversations.find((c) => c.id === s!.conversation_id)!;
      const isFirst = !db.messages.some((m) => m.conversation_id === conv.id);
      const m: Message = { id: uid('msg'), conversation_id: conv.id, direction: 'inbound', sender_type: 'customer', sender_user_id: null,
        message_type: 'text', content, created_at: new Date().toISOString() };
      db.messages.push(m);
      conv.last_message_at = m.created_at;
      if (conv.status === 'resolved' || conv.status === 'closed') conv.status = 'open';
      if (isFirst) journey(org!.id, conv.customer_id, 'inquiry', `Inquiry on website: ${content.slice(0, 50)}`, 'system', { conversation_id: conv.id });
      if (conv.ai_enabled) runFakeAgent(db, org!, conv, m);
      return { message_id: m.id };
    }
  }
  return NOT_PUBLIC;
}

function createOrg(name: string, industry = 'General'): Organization {
  const org: Organization = { id: uid('org'), name, industry, plan: 'trial', widget_key: `wk_${Math.random().toString(36).slice(2, 12)}`,
    timezone: 'Asia/Colombo', product_label: 'package', created_at: new Date().toISOString(),
    channels: (['website', 'email', 'whatsapp', 'facebook', 'instagram', 'voice'] as ChannelCode[]).map((code) => ({ code, is_enabled: code === 'website' })) };
  db.orgs.push(org);
  db.history[org.id] = Array.from({ length: 30 }, () => ({ leads: 0, escalations: 0, inbound: 0 }));
  return org;
}

function handleAccount(method: string, path: string, u: MockUser, body: any) {
  if (path === '/auth/me' && method === 'GET') {
    const me: Me = {
      id: u.id, email: u.email, full_name: u.full_name, role: u.role, permissions: permissionsFor(u.role),
      memberships: u.memberships.map((m) => ({ role: m.role, organization: db.orgs.find((o) => o.id === m.organization_id)! })).filter((m) => m.organization),
    };
    return me;
  }
  if (path === '/organizations' && method === 'POST') {
    if (!body?.name || String(body.name).trim().length < 2) fail(400, 'VALIDATION_ERROR', 'Company name is required');
    const org = createOrg(String(body.name).trim(), body.industry);
    u.memberships.push({ organization_id: org.id, role: 'admin' });
    return org;
  }
  fail(404, 'NOT_FOUND', 'Not found');
}

const inOrg = <T extends { organization_id: string }>(ctx: Ctx, list: T[]) => list.filter((x) => x.organization_id === ctx.org.id);
function findIn<T extends { id: string; organization_id: string }>(ctx: Ctx, list: T[], id: string): T {
  const x = list.find((i) => i.id === id && i.organization_id === ctx.org.id);
  if (!x) fail(404, 'NOT_FOUND', 'Not found');
  return x!;
}
const convScope = (ctx: Ctx, c: Conversation) =>
  !isExecutive(ctx.role) || c.assigned_user_id === null || c.assigned_user_id === ctx.user.id;

// ---------- organization ----------
on('GET', '/organizations/current', (ctx) => ctx.org);
on('PATCH', '/organizations/current', (ctx, _p, b) => {
  need(ctx, 'org.manage');
  Object.assign(ctx.org, pick(b, ['name', 'industry', 'timezone', 'product_label', 'channels']));
  return ctx.org;
});
on('POST', '/organizations/current/rotate-widget-key', (ctx) => {
  need(ctx, 'org.manage');
  ctx.org.widget_key = `wk_${Math.random().toString(36).slice(2, 12)}`;
  return ctx.org;
});

// ---------- customers ----------
on('GET', '/customers', (ctx, _p, _b, q) => {
  need(ctx, 'customer.read');
  const s = (q.get('q') ?? '').toLowerCase();
  const status = q.get('status');
  return page(inOrg(ctx, db.customers)
    .filter((c) => !s || [c.full_name, c.primary_email, c.primary_phone, c.company_name].some((v) => v?.toLowerCase().includes(s)))
    .filter((c) => !status || c.status === status)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
});
on('POST', '/customers', (ctx, _p, b) => {
  need(ctx, 'customer.write');
  if (!b.full_name?.trim()) fail(400, 'VALIDATION_ERROR', 'Name is required');
  if (b.primary_email && inOrg(ctx, db.customers).some((c) => c.primary_email === b.primary_email)) fail(409, 'CONFLICT', 'A customer with that email already exists');
  const now = new Date().toISOString();
  const c: Customer = { id: uid('cus'), organization_id: ctx.org.id, full_name: b.full_name.trim(), primary_email: b.primary_email || null,
    primary_phone: b.primary_phone || null, status: 'active', company_name: b.company_name || null, preferred_channel: b.preferred_channel || 'website',
    notes: '', owner_user_id: ctx.user.id, created_at: now, updated_at: now };
  db.customers.push(c);
  journey(ctx.org.id, c.id, 'first_contact', 'Customer created by staff', 'user', { actor_name: ctx.user.full_name, channel: null });
  return c;
});
on('GET', '/customers/:id', (ctx, [id]) => { need(ctx, 'customer.read'); return findIn(ctx, db.customers, id); });
on('PATCH', '/customers/:id', (ctx, [id], b) => {
  need(ctx, 'customer.write');
  const c = findIn(ctx, db.customers, id);
  Object.assign(c, pick(b, ['full_name', 'primary_email', 'primary_phone', 'company_name', 'preferred_channel', 'notes', 'status', 'owner_user_id']));
  if (c.status === 'provisional' && c.full_name && !c.full_name.startsWith('Website visitor')) c.status = 'active';
  c.updated_at = new Date().toISOString();
  journey(ctx.org.id, c.id, 'profile_updated', 'Profile updated by staff', 'user', { actor_name: ctx.user.full_name, channel: null });
  return c;
});
on('GET', '/customers/:id/contacts', (ctx, [id]) => { need(ctx, 'customer.read'); findIn(ctx, db.customers, id); return page(db.contacts.filter((c) => c.customer_id === id)); });
on('GET', '/customers/:id/timeline', (ctx, [id]) => {
  need(ctx, 'customer.read');
  findIn(ctx, db.customers, id);
  return page(db.timeline.filter((t) => t.customer_id === id && (!isExecutive(ctx.role) || t.visibility !== 'staff'))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)));
});

// ---------- leads ----------
on('GET', '/leads', (ctx, _p, _b, q) => {
  need(ctx, 'lead.read');
  const st = q.get('status'); const a = q.get('assignee'); const cid = q.get('customer_id');
  const temp = q.get('temperature'); const un = q.get('unassigned'); const team = q.get('team');
  return page(inOrg(ctx, db.leads)
    .filter((l) => leadScope(ctx, l))
    .filter((l) => !st || st.split(',').includes(l.status))
    .filter((l) => !temp || l.temperature === temp)
    .filter((l) => !un || (un === 'marketing' ? !l.marketing_user_id && l.status === 'new' : !l.sales_user_id && l.status === 'qualified'))
    .filter((l) => !team || (team === 'marketing' ? !!l.marketing_user_id : !!l.sales_user_id))
    .filter((l) => !a || (a === 'me' ? l.assigned_user_id === ctx.user.id : l.assigned_user_id === a))
    .filter((l) => !cid || l.customer_id === cid)
    .sort((x, y) => y.updated_at.localeCompare(x.updated_at)));
});
on('GET', '/leads/:id', (ctx, [id]) => { need(ctx, 'lead.read'); return getLead(ctx, id); });
on('POST', '/leads', (ctx, _p, b) => {
  need(ctx, 'lead.write');
  findIn(ctx, db.customers, b.customer_id);
  if (!b.title || b.title.length < 3) fail(400, 'VALIDATION_ERROR', 'Title must be at least 3 characters');
  if (!b.interest_summary) fail(400, 'VALIDATION_ERROR', 'Interest summary is required');
  const dup = inOrg(ctx, db.leads).find((l) => l.customer_id === b.customer_id && b.product_name && l.product_name === b.product_name && ['new', 'contacted', 'qualified'].includes(l.status));
  if (dup) fail(409, 'CONFLICT', `An open lead for ${b.product_name} already exists for this customer`);
  const now = new Date().toISOString();
  const l: Lead = { id: uid('lead'), organization_id: ctx.org.id, customer_id: b.customer_id, conversation_id: null, title: b.title, product_name: b.product_name || null,
    source_channel: b.source_channel || 'website', status: 'new', interest_summary: b.interest_summary, estimated_value: b.estimated_value ?? null,
    assigned_user_id: null, marketing_user_id: ctx.role === 'marketing_executive' ? ctx.user.id : null, sales_user_id: null, temperature: null,
    call_count: 0, last_call_at: null, next_call_at: null, call_instruction: null, handed_over_at: null, created_actor_type: 'user', created_at: now, updated_at: now };
  l.assigned_user_id = l.marketing_user_id;
  db.leads.push(l);
  journey(ctx.org.id, l.customer_id, 'lead_created', `Lead created: ${l.title}`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id });
  return l;
});
on('PATCH', '/leads/:id', (ctx, [id], b) => {
  need(ctx, 'lead.write');
  const l = getLead(ctx, id);
  if (b.status && b.status !== l.status) {
    if ((l.status === 'converted' || l.status === 'lost') && b.status === 'new') fail(400, 'VALIDATION_ERROR', `Cannot move a ${l.status} lead back to new`);
    if (b.status === 'converted') {
      need(ctx, 'customer.write');
      journey(ctx.org.id, l.customer_id, 'conversion', `Lead converted: ${l.title}`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id });
      journey(ctx.org.id, l.customer_id, 'purchase', 'Purchase confirmed by staff', 'user', { actor_name: ctx.user.full_name, lead_id: l.id });
    } else if (b.status === 'qualified') {
      journey(ctx.org.id, l.customer_id, 'qualification', `Lead qualified: ${l.title}`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id });
    }
  }
  if (b.estimated_value !== undefined && b.estimated_value !== null && b.estimated_value >= HIGH_VALUE_LEAD && (l.estimated_value ?? 0) < b.estimated_value) {
    // HIGH_VALUE_LEAD: notify supervisors (docs/features/NOTIFICATIONS.md)
    notify(ctx.org.id, (r) => isManager(r), { type: 'high_priority_customer', title: 'High-value lead', body: `${customerName(l.customer_id)} — ${l.title}`, entity_type: 'lead', entity_id: l.id });
  }
  Object.assign(l, pick(b, ['title', 'interest_summary', 'status', 'estimated_value', 'product_name', 'temperature']));
  l.updated_at = new Date().toISOString();
  return l;
});
on('DELETE', '/leads/:id', (ctx, [id]) => {
  need(ctx, 'lead.delete');
  const l = findIn(ctx, db.leads, id);
  if (l.status !== 'new' || db.followups.some((f) => f.lead_id === id)) fail(409, 'CONFLICT', 'Only new leads without follow-ups can be deleted. Mark it lost instead.');
  db.leads = db.leads.filter((x) => x.id !== id);
  return null;
});

// ---------- conversations & messages ----------
on('GET', '/conversations', (ctx, _p, _b, q) => {
  need(ctx, 'conversation.read');
  const st = q.get('status'); const ch = q.get('channel'); const a = q.get('assigned') ?? 'any'; const cid = q.get('customer_id');
  return page(inOrg(ctx, db.conversations)
    .filter((c) => convScope(ctx, c))
    .filter((c) => !st || st.split(',').includes(c.status))
    .filter((c) => !ch || c.channel === ch)
    .filter((c) => !cid || c.customer_id === cid)
    .filter((c) => a === 'any' || (a === 'me' ? c.assigned_user_id === ctx.user.id : c.assigned_user_id === null))
    .sort((x, y) => y.last_message_at.localeCompare(x.last_message_at))
    .map(decorate));
});
const getConv = (ctx: Ctx, id: string) => {
  const c = findIn(ctx, db.conversations, id);
  if (!convScope(ctx, c)) fail(404, 'NOT_FOUND', 'Not found');
  return c;
};
on('GET', '/conversations/:id', (ctx, [id]) => { need(ctx, 'conversation.read'); return decorate(getConv(ctx, id)); });
on('GET', '/conversations/:id/messages', (ctx, [id]) => {
  need(ctx, 'conversation.read'); getConv(ctx, id);
  return page(db.messages.filter((m) => m.conversation_id === id).map((m) => ({ ...m, sender_name: m.sender_name ?? userName(m.sender_user_id) })));
});
on('GET', '/conversations/:id/ai-actions', (ctx, [id]) => {
  need(ctx, 'conversation.read'); getConv(ctx, id);
  return page(db.ai_actions.filter((a) => a.conversation_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(({ intent, tool_name, tool_status, confidence_final, decision, escalation_reason, created_at }) => ({ intent, tool_name, tool_status, confidence_final, decision, escalation_reason, created_at })));
});
on('POST', '/conversations/:id/takeover', (ctx, [id]) => {
  need(ctx, 'conversation.takeover');
  const c = getConv(ctx, id);
  if (c.locked_by_user_id && c.locked_by_user_id !== ctx.user.id && !ctx.perms.includes('escalation.assign')) fail(409, 'CONFLICT', `Locked by ${userName(c.locked_by_user_id)}`);
  takeover(ctx, c);
  return decorate(c);
});
function takeover(ctx: Ctx, c: Conversation) {
  Object.assign(c, { locked_by_user_id: ctx.user.id, assigned_user_id: ctx.user.id, ai_enabled: false, status: 'assigned' });
  const e = db.escalations.find((x) => x.conversation_id === c.id && ['open', 'assigned'].includes(x.status));
  if (e) Object.assign(e, { status: 'in_progress', assigned_user_id: ctx.user.id });
}
on('POST', '/conversations/:id/release', (ctx, [id]) => {
  const c = getConv(ctx, id);
  if (c.locked_by_user_id !== ctx.user.id && !ctx.perms.includes('escalation.assign')) fail(403, 'FORBIDDEN', 'Only the lock holder or a supervisor can release');
  const active = db.escalations.some((x) => x.conversation_id === c.id && ['open', 'assigned', 'in_progress'].includes(x.status));
  Object.assign(c, { ai_enabled: true, locked_by_user_id: null, status: active ? c.status : 'open' });
  return decorate(c);
});
on('POST', '/messages', (ctx, _p, b) => {
  need(ctx, 'conversation.reply');
  const c = getConv(ctx, b.conversation_id);
  const content = String(b.content ?? '').trim();
  if (!content || content.length > 4000) fail(400, 'VALIDATION_ERROR', 'Message must be 1–4000 characters');
  if (c.locked_by_user_id && c.locked_by_user_id !== ctx.user.id) fail(409, 'CONVERSATION_LOCKED', `${userName(c.locked_by_user_id)} is handling this conversation`);
  if (!c.assigned_user_id) { c.assigned_user_id = ctx.user.id; }
  const m: Message = { id: uid('msg'), conversation_id: c.id, direction: 'outbound', sender_type: 'staff', sender_user_id: ctx.user.id,
    sender_name: ctx.user.full_name, message_type: 'text', content, created_at: new Date().toISOString() };
  db.messages.push(m);
  c.last_message_at = m.created_at;
  return m;
});

// ---------- marketing → sales hand-off ----------
/** Executives only see leads assigned to them; managers and admin see the whole workspace. */
function leadScope(ctx: Ctx, l: Lead) {
  if (ctx.role === 'marketing_executive') return l.marketing_user_id === ctx.user.id;
  if (ctx.role === 'sales_executive') return l.sales_user_id === ctx.user.id;
  if (ctx.role === 'sales_manager') return ['qualified', 'site_visit', 'negotiation', 'converted', 'lost'].includes(l.status) || !!l.handed_over_at;
  return true;
}
function getLead(ctx: Ctx, id: string) {
  const l = findIn(ctx, db.leads, id);
  if (!leadScope(ctx, l)) fail(404, 'NOT_FOUND', 'Not found');
  return l;
}
const syncOwner = (l: Lead) => { l.assigned_user_id = l.sales_user_id ?? l.marketing_user_id; l.updated_at = new Date().toISOString(); };
const memberRole = (orgId: string, userId: string) =>
  db.users.find((u) => u.id === userId && u.is_active)?.memberships.find((m) => m.organization_id === orgId)?.role;
const membership = (orgId: string, userId: string) =>
  db.users.find((u) => u.id === userId)?.memberships.find((m) => m.organization_id === orgId);
/** A manager works with the executives who report to them (or who have no manager yet). */
const inMyTeam = (ctx: Ctx, userId: string) => {
  if (!isManager(ctx.role)) return true;
  const m = membership(ctx.org.id, userId)?.manager_id;
  return !m || m === ctx.user.id;
};
const ACTIVE_VISIT = ['scheduled', 'on_the_way', 'checked_in'];

on('POST', '/leads/assign', (ctx, _p, b) => {
  const team = b.team as Team;
  need(ctx, team === 'sales' ? 'lead.assign.sales' : 'lead.assign.marketing');
  const ids: string[] = Array.isArray(b.lead_ids) ? b.lead_ids : [];
  if (!ids.length) fail(400, 'VALIDATION_ERROR', 'Choose at least one lead');
  if (memberRole(ctx.org.id, b.user_id) !== executiveRole[team]) fail(400, 'VALIDATION_ERROR', `Pick a ${team} executive`);
  if (!inMyTeam(ctx, b.user_id)) fail(400, 'VALIDATION_ERROR', `${userName(b.user_id)} reports to another manager`);
  if (b.call_by && new Date(b.call_by).getTime() < Date.now()) fail(400, 'VALIDATION_ERROR', '"Call by" must be in the future');
  const name = userName(b.user_id);
  for (const id of ids) {
    const l = getLead(ctx, id);
    if (team === 'sales' && !['qualified', 'site_visit', 'negotiation'].includes(l.status)) fail(409, 'CONFLICT', `${l.title} has not been handed over to sales yet`);
    if (team === 'marketing') { l.marketing_user_id = b.user_id; if (b.call_by) l.next_call_at = new Date(b.call_by).toISOString(); } else l.sales_user_id = b.user_id;
    syncOwner(l);
    journey(ctx.org.id, l.customer_id, 'profile_updated', `Assigned to ${name} (${team})`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id, channel: null });
  }
  notify(ctx.org.id, (_r, u) => u === b.user_id, { type: 'task_assigned', title: `${ids.length} lead${ids.length > 1 ? 's' : ''} assigned to you`,
    body: team === 'marketing' ? 'Call them and mark hot / warm / cold' : 'Schedule the site visits', entity_type: 'lead', entity_id: ids[0] });
  return { assigned: ids.length };
});

/** Marketing manager schedules calls on existing leads: executive + time + instruction. */
on('POST', '/leads/assign-calls', (ctx, _p, b) => {
  need(ctx, 'lead.assign.marketing');
  const ids: string[] = Array.isArray(b.lead_ids) ? b.lead_ids : [];
  if (!ids.length) fail(400, 'VALIDATION_ERROR', 'Choose at least one lead');
  if (memberRole(ctx.org.id, b.user_id) !== 'marketing_executive') fail(400, 'VALIDATION_ERROR', 'Pick a marketing executive');
  if (!inMyTeam(ctx, b.user_id)) fail(400, 'VALIDATION_ERROR', `${userName(b.user_id)} reports to another manager`);
  if (!b.call_at || new Date(b.call_at).getTime() < Date.now()) fail(400, 'VALIDATION_ERROR', 'Call time must be in the future');
  for (const id of ids) {
    const l = getLead(ctx, id);
    if (!['new', 'contacted'].includes(l.status)) fail(409, 'CONFLICT', `${l.title} is already with sales`);
    l.marketing_user_id = b.user_id;
    l.next_call_at = new Date(b.call_at).toISOString();
    l.call_instruction = String(b.instruction ?? '').trim() || null;
    syncOwner(l);
  }
  notify(ctx.org.id, (_r, u) => u === b.user_id, { type: 'task_assigned', title: `${ids.length} call${ids.length > 1 ? 's' : ''} assigned to you`,
    body: `${new Date(b.call_at).toLocaleString()}${b.instruction ? ` — ${String(b.instruction).trim()}` : ''}`, entity_type: 'lead', entity_id: ids[0] });
  return { assigned: ids.length };
});
on('GET', '/leads/:id/calls', (ctx, [id]) => {
  need(ctx, 'lead.read'); getLead(ctx, id);
  return page(db.calls.filter((c) => c.lead_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((c) => ({ ...c, user_name: userName(c.user_id) })));
});
on('GET', '/calls', (ctx, _p, _b, q) => {
  need(ctx, 'call.log');
  const mine = q.get('mine') === 'true' || ctx.role === 'marketing_executive';
  return page(inOrg(ctx, db.calls).filter((c) => !mine || c.user_id === ctx.user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).map((c) => ({ ...c, user_name: userName(c.user_id) })));
});
on('POST', '/leads/:id/calls', (ctx, [id], b) => {
  need(ctx, 'call.log');
  const l = getLead(ctx, id);
  if (ctx.role === 'marketing_executive' && l.marketing_user_id !== ctx.user.id) fail(403, 'FORBIDDEN', 'This lead is assigned to someone else');
  if (!['answered', 'no_answer', 'busy', 'wrong_number', 'call_back'].includes(b.outcome)) fail(400, 'VALIDATION_ERROR', 'Choose a call outcome');
  if (b.outcome === 'answered' && !b.temperature) fail(400, 'VALIDATION_ERROR', 'Mark the lead hot, warm or cold');
  if (b.hand_over && b.temperature === 'cold') fail(400, 'VALIDATION_ERROR', 'Cold leads cannot be handed to sales');
  if (b.next_call_at && new Date(b.next_call_at).getTime() < Date.now()) fail(400, 'VALIDATION_ERROR', 'Callback time must be in the future');
  const now = new Date().toISOString();
  const c: CallLog = { id: uid('call'), organization_id: ctx.org.id, lead_id: l.id, customer_id: l.customer_id, user_id: ctx.user.id, outcome: b.outcome,
    temperature: b.temperature ?? null, notes: String(b.notes ?? '').trim(), next_call_at: b.next_call_at ?? null, handed_over: !!b.hand_over, created_at: now };
  db.calls.push(c);
  l.call_count += 1;
  l.last_call_at = now;
  l.next_call_at = b.hand_over ? null : (b.next_call_at ?? null);
  l.call_instruction = null;
  if (b.temperature) l.temperature = b.temperature;
  if (l.status === 'new') l.status = 'contacted';
  if (!l.marketing_user_id) l.marketing_user_id = ctx.user.id;
  if (b.outcome === 'wrong_number') l.status = 'unqualified';
  if (b.hand_over) {
    l.status = 'qualified';
    l.handed_over_at = now;
    journey(ctx.org.id, l.customer_id, 'qualification', `${(b.temperature ?? '').toUpperCase()} lead handed to sales: ${l.title}`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id, channel: 'voice' });
    notify(ctx.org.id, (r) => r === 'sales_manager' || r === 'admin', { type: 'new_lead', title: 'Lead handed to sales', body: `${customerName(l.customer_id)} — ${l.title} (${b.temperature})`, entity_type: 'lead', entity_id: l.id });
  } else {
    journey(ctx.org.id, l.customer_id, 'support', `Call: ${b.outcome.replace('_', ' ')}${b.temperature ? ` · ${b.temperature}` : ''}`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id, channel: 'voice' });
  }
  syncOwner(l);
  return { ...c, user_name: ctx.user.full_name };
});

const visitView = (v: SiteVisit) => ({ ...v, user_name: userName(v.user_id), assigned_by_name: userName(v.assigned_by) });
const ownVisit = (ctx: Ctx, id: string) => {
  need(ctx, 'visit.manage');
  const v = findIn(ctx, db.visits, id);
  if (ctx.role === 'sales_executive' && v.user_id !== ctx.user.id) fail(403, 'FORBIDDEN', 'Not your visit');
  return v;
};
const leadOf = (v: SiteVisit) => db.leads.find((x) => x.id === v.lead_id)!;
/** When a lead has no active visit left, it goes back to the sales manager's "needs a visit" queue. */
const backToQueue = (l: Lead) => {
  if (l.status === 'site_visit' && !db.visits.some((x) => x.lead_id === l.id && ACTIVE_VISIT.includes(x.status))) l.status = 'qualified';
  syncOwner(l);
};
const toManagers = (ctx: Ctx, execId: string) => (r: Role, u: string) => {
  if (r !== 'sales_manager') return false;
  const m = membership(ctx.org.id, execId)?.manager_id;
  return !m || m === u;
};

on('GET', '/visits', (ctx, _p, _b, q) => {
  need(ctx, 'visit.manage');
  const mine = q.get('mine') === 'true' || ctx.role === 'sales_executive';
  const lid = q.get('lead_id');
  return page(inOrg(ctx, db.visits).filter((v) => !mine || v.user_id === ctx.user.id).filter((v) => !lid || v.lead_id === lid)
    .filter((v) => mine || inMyTeam(ctx, v.user_id))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map(visitView));
});
on('GET', '/leads/:id/visits', (ctx, [id]) => {
  need(ctx, 'lead.read'); getLead(ctx, id);
  return page(db.visits.filter((v) => v.lead_id === id).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)).map(visitView));
});
/** Sales manager assigns a site visit: executive + time + site. Executives cannot book their own. */
on('POST', '/visits', (ctx, _p, b) => {
  need(ctx, 'visit.assign');
  const l = getLead(ctx, b.lead_id);
  if (!['qualified', 'site_visit', 'negotiation'].includes(l.status)) fail(409, 'CONFLICT', 'Only leads marketing handed over can get a site visit');
  if (memberRole(ctx.org.id, b.user_id) !== 'sales_executive') fail(400, 'VALIDATION_ERROR', 'Pick a sales executive');
  if (!inMyTeam(ctx, b.user_id)) fail(400, 'VALIDATION_ERROR', `${userName(b.user_id)} reports to another manager`);
  if (!b.scheduled_at || new Date(b.scheduled_at).getTime() < Date.now()) fail(400, 'VALIDATION_ERROR', 'Visit time must be in the future');
  if (!String(b.location ?? '').trim()) fail(400, 'VALIDATION_ERROR', 'Site address is required');
  const v: SiteVisit = { id: uid('vis'), organization_id: ctx.org.id, lead_id: l.id, customer_id: l.customer_id, user_id: b.user_id,
    scheduled_at: new Date(b.scheduled_at).toISOString(), location: String(b.location).trim(), status: 'scheduled', outcome: null, notes: '', completed_at: null,
    assigned_by: ctx.user.id, manager_notes: String(b.manager_notes ?? '').trim(), started_at: null, checked_in_at: null,
    interest_level: null, feedback: '', next_step: '', follow_up_at: null, reschedule_reason: null };
  db.visits.push(v);
  l.status = 'site_visit';
  l.sales_user_id = b.user_id;
  syncOwner(l);
  journey(ctx.org.id, l.customer_id, 'follow_up_scheduled', `Site visit assigned to ${userName(b.user_id)}: ${v.location}`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id, channel: null });
  notify(ctx.org.id, (_r, u) => u === b.user_id, { type: 'task_assigned', title: 'New site visit assigned',
    body: `${customerName(l.customer_id)} · ${new Date(v.scheduled_at).toLocaleString()} · ${v.location}`, entity_type: 'lead', entity_id: l.id });
  return visitView(v);
});
/** Manager reschedules / reassigns / edits a visit that hasn't happened yet. */
on('PATCH', '/visits/:id', (ctx, [id], b) => {
  need(ctx, 'visit.assign');
  const v = findIn(ctx, db.visits, id);
  if (!ACTIVE_VISIT.includes(v.status)) fail(409, 'CONFLICT', 'This visit is already closed');
  if (b.user_id && b.user_id !== v.user_id) {
    if (memberRole(ctx.org.id, b.user_id) !== 'sales_executive') fail(400, 'VALIDATION_ERROR', 'Pick a sales executive');
    if (!inMyTeam(ctx, b.user_id)) fail(400, 'VALIDATION_ERROR', `${userName(b.user_id)} reports to another manager`);
    v.user_id = b.user_id; v.status = 'scheduled'; v.started_at = null;
    const l = leadOf(v); l.sales_user_id = b.user_id; syncOwner(l);
  }
  if (b.scheduled_at) {
    if (new Date(b.scheduled_at).getTime() < Date.now()) fail(400, 'VALIDATION_ERROR', 'Visit time must be in the future');
    v.scheduled_at = new Date(b.scheduled_at).toISOString(); v.status = 'scheduled'; v.started_at = null;
  }
  if (b.location !== undefined) v.location = String(b.location).trim() || v.location;
  if (b.manager_notes !== undefined) v.manager_notes = String(b.manager_notes);
  v.reschedule_reason = null;
  notify(ctx.org.id, (_r, u) => u === v.user_id, { type: 'task_assigned', title: 'Site visit updated',
    body: `${customerName(v.customer_id)} · ${new Date(v.scheduled_at).toLocaleString()} · ${v.location}`, entity_type: 'lead', entity_id: v.lead_id });
  return visitView(v);
});
on('POST', '/visits/:id/start', (ctx, [id]) => {
  const v = ownVisit(ctx, id);
  if (v.status !== 'scheduled') fail(409, 'CONFLICT', 'Visit already started or closed');
  Object.assign(v, { status: 'on_the_way', started_at: new Date().toISOString() });
  return visitView(v);
});
on('POST', '/visits/:id/checkin', (ctx, [id]) => {
  const v = ownVisit(ctx, id);
  if (!['scheduled', 'on_the_way'].includes(v.status)) fail(409, 'CONFLICT', 'Visit already closed');
  Object.assign(v, { status: 'checked_in', checked_in_at: new Date().toISOString(), started_at: v.started_at ?? new Date().toISOString() });
  journey(ctx.org.id, v.customer_id, 'support', `Arrived at site: ${v.location}`, 'user', { actor_name: ctx.user.full_name, lead_id: v.lead_id, channel: null });
  return visitView(v);
});
/** The visit report. */
on('POST', '/visits/:id/complete', (ctx, [id], b) => {
  const v = ownVisit(ctx, id);
  if (!ACTIVE_VISIT.includes(v.status)) fail(409, 'CONFLICT', 'Report already written');
  if (!['booked', 'negotiating', 'interested', 'not_interested'].includes(b.outcome)) fail(400, 'VALIDATION_ERROR', 'Choose what happened at the visit');
  if (!['high', 'medium', 'low'].includes(b.interest_level)) fail(400, 'VALIDATION_ERROR', 'Choose how interested the customer is');
  if (!String(b.feedback ?? '').trim()) fail(400, 'VALIDATION_ERROR', 'Write what the customer said');
  if (b.follow_up_at && new Date(b.follow_up_at).getTime() < Date.now()) fail(400, 'VALIDATION_ERROR', 'Follow-up date must be in the future');
  const now = new Date().toISOString();
  Object.assign(v, { status: 'completed', outcome: b.outcome, interest_level: b.interest_level, feedback: String(b.feedback).trim(),
    next_step: String(b.next_step ?? '').trim(), follow_up_at: b.follow_up_at ?? null, notes: String(b.notes ?? '').trim(), completed_at: now,
    checked_in_at: v.checked_in_at ?? now, reschedule_reason: null });
  const l = leadOf(v);
  // interested → back to the manager's queue for a second visit; others move the deal on
  l.status = b.outcome === 'booked' ? 'converted' : b.outcome === 'negotiating' ? 'negotiation' : b.outcome === 'not_interested' ? 'lost' : 'qualified';
  syncOwner(l);
  journey(ctx.org.id, l.customer_id, 'follow_up_completed', `Site visit report: ${b.outcome.replace('_', ' ')} · ${b.interest_level} interest`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id, channel: null });
  if (b.follow_up_at) {
    db.followups.push({ id: uid('fu'), organization_id: ctx.org.id, customer_id: l.customer_id, lead_id: l.id, conversation_id: null, scheduled_at: b.follow_up_at,
      channel: 'voice', reason: String(b.next_step || 'Follow up after site visit'), status: 'scheduled', assigned_user_id: v.user_id, created_actor_type: 'user' });
  }
  if (b.outcome === 'booked') {
    journey(ctx.org.id, l.customer_id, 'conversion', `Lead converted: ${l.title}`, 'user', { actor_name: ctx.user.full_name, lead_id: l.id, channel: null });
    journey(ctx.org.id, l.customer_id, 'purchase', 'Booking confirmed by sales', 'user', { actor_name: ctx.user.full_name, lead_id: l.id, channel: null });
  }
  notify(ctx.org.id, toManagers(ctx, v.user_id), { type: 'new_lead', title: `Visit report: ${customerName(l.customer_id)}`,
    body: `${ctx.user.full_name} · ${b.outcome.replace('_', ' ')}${b.outcome === 'interested' ? ' — needs another visit' : ''}`, entity_type: 'lead', entity_id: l.id });
  return visitView(v);
});
on('POST', '/visits/:id/reschedule-request', (ctx, [id], b) => {
  const v = ownVisit(ctx, id);
  if (!ACTIVE_VISIT.includes(v.status)) fail(409, 'CONFLICT', 'Visit already closed');
  if (!String(b.reason ?? '').trim()) fail(400, 'VALIDATION_ERROR', 'Say why it needs a new time');
  v.reschedule_reason = String(b.reason).trim();
  notify(ctx.org.id, toManagers(ctx, v.user_id), { type: 'new_lead', title: 'Reschedule requested', body: `${customerName(v.customer_id)} — ${v.reschedule_reason}`, entity_type: 'lead', entity_id: v.lead_id });
  return visitView(v);
});
/** no_show: customer didn't come (executive or manager). Plain cancel: managers only. */
on('POST', '/visits/:id/cancel', (ctx, [id], b) => {
  const v = ownVisit(ctx, id);
  if (!ACTIVE_VISIT.includes(v.status)) fail(409, 'CONFLICT', 'Visit already closed');
  if (!b.no_show) need(ctx, 'visit.assign');
  v.status = b.no_show ? 'no_show' : 'cancelled';
  v.notes = String(b.notes ?? v.notes);
  v.completed_at = new Date().toISOString();
  backToQueue(leadOf(v));
  if (b.no_show) notify(ctx.org.id, toManagers(ctx, v.user_id), { type: 'new_lead', title: 'Customer did not come', body: `${customerName(v.customer_id)} · ${v.location}`, entity_type: 'lead', entity_id: v.lead_id });
  return visitView(v);
});

on('GET', '/team/workload', (ctx, _p, _b, q) => {
  const team = (q.get('team') ?? 'marketing') as Team;
  if (!isManager(ctx.role)) fail(403, 'FORBIDDEN', 'Managers only');
  const role = executiveRole[team];
  const now = Date.now();
  const members = db.users.filter((u) => u.is_active && u.memberships.some((m) => m.organization_id === ctx.org.id && m.role === role)).filter((u) => inMyTeam(ctx, u.id));
  return page<TeamMemberLoad>(members.map((u) => {
    const mine = inOrg(ctx, db.leads).filter((l) => (team === 'marketing' ? l.marketing_user_id : l.sales_user_id) === u.id);
    const open = mine.filter((l) => team === 'marketing' ? ['new', 'contacted'].includes(l.status) : ['qualified', 'site_visit', 'negotiation'].includes(l.status));
    const visits = inOrg(ctx, db.visits).filter((v) => v.user_id === u.id);
    return {
      user_id: u.id, full_name: u.full_name, role,
      open_leads: open.length,
      hot: open.filter((l) => l.temperature === 'hot').length,
      warm: open.filter((l) => l.temperature === 'warm').length,
      cold: open.filter((l) => l.temperature === 'cold').length,
      callbacks_due: open.filter((l) => l.next_call_at && new Date(l.next_call_at).getTime() <= now + 24 * H).length,
      visits_upcoming: visits.filter((v) => ACTIVE_VISIT.includes(v.status)).length,
      visits_done: visits.filter((v) => v.status === 'completed').length,
      converted: mine.filter((l) => l.status === 'converted').length,
    };
  }));
});

/** Per-executive numbers for the manager's own team. */
on('GET', '/team/performance', (ctx, _p, _b, q) => {
  need(ctx, 'team.performance');
  const team = (ctx.role === 'sales_manager' ? 'sales' : ctx.role === 'marketing_manager' ? 'marketing' : (q.get('team') ?? 'marketing')) as Team;
  const role = executiveRole[team];
  const now = Date.now();
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  const members = db.users.filter((u) => u.is_active && u.memberships.some((m) => m.organization_id === ctx.org.id && m.role === role)).filter((u) => inMyTeam(ctx, u.id));
  return page<ExecPerformance>(members.map((u) => {
    const leads = inOrg(ctx, db.leads).filter((l) => (team === 'marketing' ? l.marketing_user_id : l.sales_user_id) === u.id);
    const calls = inOrg(ctx, db.calls).filter((c) => c.user_id === u.id);
    const visits = inOrg(ctx, db.visits).filter((v) => v.user_id === u.id);
    const open = leads.filter((l) => ['new', 'contacted'].includes(l.status));
    return {
      user_id: u.id, full_name: u.full_name, role,
      assigned: leads.length,
      not_called: leads.filter((l) => l.status === 'new').length,
      stale: leads.filter((l) => l.status === 'new' && now - new Date(l.updated_at).getTime() > 24 * H).length,
      overdue_callbacks: open.filter((l) => l.next_call_at && new Date(l.next_call_at).getTime() < now).length,
      calls: calls.length,
      calls_today: calls.filter((c) => new Date(c.created_at) >= sod).length,
      answered_rate: calls.length ? calls.filter((c) => c.outcome === 'answered').length / calls.length : 0,
      hot: open.filter((l) => l.temperature === 'hot').length,
      warm: open.filter((l) => l.temperature === 'warm').length,
      cold: open.filter((l) => l.temperature === 'cold').length,
      handed_over: calls.filter((c) => c.handed_over).length,
      last_call_at: calls.map((c) => c.created_at).sort().pop() ?? null,
      visits_assigned: visits.length,
      visits_today: visits.filter((v) => new Date(v.scheduled_at) >= sod && new Date(v.scheduled_at) <= eod).length,
      visits_done: visits.filter((v) => v.status === 'completed').length,
      no_shows: visits.filter((v) => v.status === 'no_show').length,
      reports_pending: visits.filter((v) => ACTIVE_VISIT.includes(v.status) && new Date(v.scheduled_at).getTime() < now).length,
      won: leads.filter((l) => l.status === 'converted').length,
      lost: leads.filter((l) => l.status === 'lost').length,
      negotiating: leads.filter((l) => l.status === 'negotiation').length,
    };
  }));
});

// ---------- follow-ups ----------
on('GET', '/followups', (ctx, _p, _b, q) => {
  need(ctx, 'followup.read');
  const st = q.get('status'); const before = q.get('due_before'); const a = q.get('assignee'); const cid = q.get('customer_id');
  return page(inOrg(ctx, db.followups)
    .filter((f) => !st || f.status === st)
    .filter((f) => !before || f.scheduled_at <= before)
    .filter((f) => !a || f.assigned_user_id === ctx.user.id)
    .filter((f) => !cid || f.customer_id === cid)
    .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at)));
});
on('POST', '/followups', (ctx, _p, b) => {
  need(ctx, 'followup.write');
  findIn(ctx, db.customers, b.customer_id);
  const t = new Date(b.scheduled_at).getTime();
  if (!(t > Date.now()) || t > Date.now() + 30 * 24 * H) fail(400, 'FOLLOWUP_REJECTED', 'Follow-up must be in the future and within 30 days');
  const f: FollowUp = { id: uid('fu'), organization_id: ctx.org.id, customer_id: b.customer_id, lead_id: b.lead_id ?? null, conversation_id: b.conversation_id ?? null,
    scheduled_at: new Date(b.scheduled_at).toISOString(), channel: b.channel ?? 'voice', reason: b.reason ?? 'Follow-up', status: 'scheduled',
    assigned_user_id: b.assigned_user_id ?? ctx.user.id, created_actor_type: 'user' };
  db.followups.push(f);
  journey(ctx.org.id, f.customer_id, 'follow_up_scheduled', `Follow-up scheduled: ${f.reason}`, 'user', { actor_name: ctx.user.full_name, lead_id: f.lead_id });
  return f;
});
on('POST', '/followups/:id/complete', (ctx, [id], b) => {
  need(ctx, 'followup.write');
  const f = findIn(ctx, db.followups, id);
  Object.assign(f, { status: 'completed', completed_at: new Date().toISOString(), notes: b.notes ?? null });
  journey(ctx.org.id, f.customer_id, 'follow_up_completed', `Follow-up completed: ${f.reason}`, 'user', { actor_name: ctx.user.full_name, lead_id: f.lead_id });
  return f;
});
on('POST', '/followups/:id/cancel', (ctx, [id]) => { need(ctx, 'followup.write'); const f = findIn(ctx, db.followups, id); f.status = 'cancelled'; return f; });

// ---------- tasks ----------
on('GET', '/tasks', (ctx, _p, _b, q) => {
  need(ctx, 'task.read');
  const st = q.get('status'); const a = q.get('assignee');
  return page(inOrg(ctx, db.tasks).filter((t) => !st || t.status === st).filter((t) => !a || t.assigned_user_id === ctx.user.id)
    .sort((x, y) => (x.due_at ?? '9').localeCompare(y.due_at ?? '9')));
});
on('POST', '/tasks', (ctx, _p, b) => {
  need(ctx, 'task.write');
  if (!b.title || b.title.length < 3) fail(400, 'VALIDATION_ERROR', 'Title must be at least 3 characters');
  const t: Task = { id: uid('task'), organization_id: ctx.org.id, title: b.title, description: b.description || null, priority: b.priority ?? 'medium', status: 'open',
    customer_id: b.customer_id || null, assigned_user_id: b.assigned_user_id ?? ctx.user.id, due_at: b.due_at || null, created_actor_type: 'user' };
  db.tasks.push(t);
  if (t.assigned_user_id && t.assigned_user_id !== ctx.user.id) notify(ctx.org.id, (_r, uidv) => uidv === t.assigned_user_id, { type: 'task_assigned', title: 'Task assigned to you', body: t.title, entity_type: 'task', entity_id: t.id });
  return t;
});
on('PATCH', '/tasks/:id', (ctx, [id], b) => { need(ctx, 'task.write'); const t = findIn(ctx, db.tasks, id); Object.assign(t, pick(b, ['status', 'assigned_user_id', 'priority', 'due_at', 'title', 'description'])); return t; });

// ---------- escalations ----------
on('GET', '/escalations', (ctx, _p, _b, q) => {
  need(ctx, 'escalation.read');
  const st = q.get('status'); const pr = q.get('priority'); const a = q.get('assignee');
  const rank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return page(inOrg(ctx, db.escalations)
    .filter((e) => !isExecutive(ctx.role) || e.assigned_user_id === null || e.assigned_user_id === ctx.user.id)
    .filter((e) => !st || st.split(',').includes(e.status))
    .filter((e) => !pr || e.priority === pr)
    .filter((e) => !a || (a === 'me' ? e.assigned_user_id === ctx.user.id : e.assigned_user_id === null))
    .sort((x, y) => rank[x.priority] - rank[y.priority] || x.created_at.localeCompare(y.created_at))
    .map((e) => ({ ...e, customer_name: customerName(e.customer_id), assigned_user_name: userName(e.assigned_user_id) })));
});
on('POST', '/escalations', (ctx, _p, b) => {
  need(ctx, 'conversation.reply');
  const c = getConv(ctx, b.conversation_id);
  if (db.escalations.some((x) => x.conversation_id === c.id && ['open', 'assigned', 'in_progress'].includes(x.status))) fail(409, 'CONFLICT', 'This conversation already has an active escalation');
  return openEscalation(c, 'staff_requested', b.priority ?? 'medium', 'staff', b.reason_detail ?? '');
});
on('POST', '/escalations/:id/assign', (ctx, [id], b) => {
  need(ctx, 'escalation.assign');
  const e = findIn(ctx, db.escalations, id);
  Object.assign(e, { assigned_user_id: b.user_id, status: 'assigned' });
  const c = db.conversations.find((x) => x.id === e.conversation_id);
  if (c) c.assigned_user_id = b.user_id;
  notify(ctx.org.id, (_r, u) => u === b.user_id, { type: 'conversation_assigned', title: 'Escalation assigned to you', body: customerName(e.customer_id), entity_type: 'escalation', entity_id: e.id });
  return e;
});
on('POST', '/escalations/:id/takeover', (ctx, [id]) => {
  need(ctx, 'conversation.takeover');
  const e = findIn(ctx, db.escalations, id);
  const c = findIn(ctx, db.conversations, e.conversation_id);
  takeover(ctx, c);
  return e;
});
on('POST', '/escalations/:id/resolve', (ctx, [id], b) => {
  const e = findIn(ctx, db.escalations, id);
  if (e.assigned_user_id !== ctx.user.id && !ctx.perms.includes('escalation.assign')) fail(403, 'FORBIDDEN', 'Only the assignee or a supervisor can resolve');
  const notes = String(b.resolution_notes ?? '').trim();
  if (!notes) fail(400, 'VALIDATION_ERROR', 'Resolution notes are required');
  Object.assign(e, { status: 'resolved', resolved_at: new Date().toISOString(), resolution_notes: notes });
  const c = db.conversations.find((x) => x.id === e.conversation_id);
  if (c) c.status = 'resolved';
  journey(ctx.org.id, e.customer_id, 'resolution', `Resolved: ${notes.slice(0, 80)}`, 'user', { actor_name: ctx.user.full_name, visibility: 'staff', escalation_id: e.id });
  return e;
});

// ---------- knowledge ----------
on('GET', '/knowledge/documents', (ctx, _p, _b, q) => {
  need(ctx, 'knowledge.read');
  const st = q.get('status');
  return page(inOrg(ctx, db.knowledge).filter((d) => !st || d.status === st).sort((a, b) => a.title.localeCompare(b.title)));
});
on('POST', '/knowledge/documents', (ctx, _p, b) => {
  need(ctx, 'knowledge.write');
  if (!b.title || !b.body) fail(400, 'VALIDATION_ERROR', 'Title and body are required');
  const d: KnowledgeDocument = { id: uid('kdoc'), organization_id: ctx.org.id, title: b.title, source_type: b.source_type ?? 'faq', body: b.body, status: 'draft', version: 0, chunk_count: 0, updated_at: new Date().toISOString() };
  db.knowledge.push(d);
  return d;
});
on('PATCH', '/knowledge/documents/:id', (ctx, [id], b) => {
  need(ctx, 'knowledge.write');
  const d = findIn(ctx, db.knowledge, id);
  Object.assign(d, pick(b, ['title', 'body', 'source_type']));
  d.status = 'draft'; d.updated_at = new Date().toISOString();
  return d;
});
on('POST', '/knowledge/documents/:id/publish', (ctx, [id]) => {
  need(ctx, 'knowledge.publish');
  const d = findIn(ctx, db.knowledge, id);
  Object.assign(d, { status: 'published', version: d.version + 1, chunk_count: Math.max(1, Math.ceil(d.body.length / 400)), updated_at: new Date().toISOString() });
  return { id: d.id, status: d.status, version: d.version, chunk_count: d.chunk_count };
});
on('POST', '/knowledge/documents/:id/archive', (ctx, [id]) => {
  need(ctx, 'knowledge.publish');
  const d = findIn(ctx, db.knowledge, id);
  Object.assign(d, { status: 'archived', chunk_count: 0 });
  return d;
});
on('POST', '/knowledge/search', (ctx, _p, b) => {
  need(ctx, 'knowledge.read');
  return { chunks: searchKnowledge(ctx.org.id, String(b.query ?? '')) };
});
export function searchKnowledge(orgId: string, query: string) {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  return db.knowledge.filter((d) => d.organization_id === orgId && d.status === 'published')
    .map((d) => {
      const text = (d.title + ' ' + d.body).toLowerCase();
      const hits = words.filter((w) => text.includes(w)).length;
      return { document_id: d.id, title: d.title, content: d.body, similarity: words.length ? Math.min(0.97, 0.45 + (hits / words.length) * 0.5) : 0 };
    })
    .filter((c) => c.similarity > 0.6).sort((a, b) => b.similarity - a.similarity).slice(0, 3);
}

// ---------- analytics ----------
on('GET', '/analytics/dashboard', (ctx, _p, _b, q) => {
  need(ctx, 'analytics.read');
  const to = q.get('to') ? new Date(q.get('to')! + 'T23:59:59') : new Date();
  const from = q.get('from') ? new Date(q.get('from')!) : new Date(Date.now() - 7 * 24 * H);
  const inRange = (d: string) => { const t = new Date(d).getTime(); return t >= from.getTime() && t <= to.getTime(); };
  const mine = isExecutive(ctx.role);
  const leads = inOrg(ctx, db.leads).filter((l) => inRange(l.created_at) && (!mine || l.assigned_user_id === ctx.user.id));
  const convIds = new Set(inOrg(ctx, db.conversations).filter((c) => !mine || c.assigned_user_id === ctx.user.id).map((c) => c.id));
  const convs = db.conversations.filter((c) => convIds.has(c.id));
  const inbound = db.messages.filter((m) => convIds.has(m.conversation_id) && m.direction === 'inbound' && inRange(m.created_at) && !convs.find((c) => c.id === m.conversation_id)?.simulated);
  const escs = inOrg(ctx, db.escalations).filter((e) => convIds.has(e.conversation_id) && inRange(e.created_at));
  const days = Math.max(1, Math.min(30, Math.round((to.getTime() - from.getTime()) / (24 * H))));
  const hist = (db.history[ctx.org.id] ?? []).slice(-days);
  const scale = mine ? 0.35 : 1;
  const daily = hist.map((h, i) => {
    const d = new Date(to.getTime() - (hist.length - 1 - i) * 24 * H);
    const key = d.toISOString().slice(0, 10);
    const sameDay = (s: string) => s.slice(0, 10) === key;
    return { date: key,
      leads: Math.round(h.leads * scale) + leads.filter((l) => sameDay(l.created_at)).length,
      escalations: Math.round(h.escalations * scale) + escs.filter((e) => sameDay(e.created_at)).length,
      inbound: Math.round(h.inbound * scale) + inbound.filter((m) => sameDay(m.created_at)).length };
  });
  const leadsCreated = daily.reduce((s, d) => s + d.leads, 0);
  const totalInbound = daily.reduce((s, d) => s + d.inbound, 0);
  const totalEsc = daily.reduce((s, d) => s + d.escalations, 0);
  const converted = Math.round(leadsCreated * (ctx.org.id === 'org_northline' ? 0.24 : 0.18)) + leads.filter((l) => l.status === 'converted').length;
  const byStatus: Dashboard['leads_by_status'] = {};
  for (const l of inOrg(ctx, db.leads)) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  const tools = new Map<string, number>();
  for (const a of db.ai_actions.filter((a) => convIds.has(a.conversation_id) && a.tool_name)) {
    const k = `${a.tool_name}|${a.tool_status}`; tools.set(k, (tools.get(k) ?? 0) + 1);
  }
  const web = Math.round(totalInbound * 0.86);
  const res: Dashboard = {
    leads_created: leadsCreated, leads_converted: converted, conversion_rate: leadsCreated ? converted / leadsCreated : 0,
    interactions: totalInbound + leadsCreated * 2, messages_by_channel: { website: web, email: totalInbound - web, whatsapp: 0, facebook: 0, instagram: 0, voice: 0 },
    median_first_response_seconds: 7, ai_resolution_rate: totalInbound ? 1 - totalEsc / Math.max(1, totalInbound / 3) : 0,
    escalation_rate: totalInbound ? totalEsc / totalInbound : 0, followups_completed: inOrg(ctx, db.followups).filter((f) => f.status === 'completed').length + Math.round(leadsCreated * 0.4),
    followups_missed: inOrg(ctx, db.followups).filter((f) => f.status === 'missed').length + Math.round(leadsCreated * 0.03),
    leads_by_status: byStatus,
    ai_actions_by_tool: [...tools.entries()].map(([k, count]) => { const [tool_name, tool_status] = k.split('|'); return { tool_name, tool_status: tool_status as any, count }; }).sort((a, b) => b.count - a.count),
    median_ai_latency_ms: 2140, daily,
  };
  return res;
});
on('GET', '/analytics/agents', (ctx) => {
  need(ctx, 'analytics.read');
  if (!isManager(ctx.role)) fail(403, 'FORBIDDEN', 'Managers only');
  const members = db.users.filter((u) => u.memberships.some((m) => m.organization_id === ctx.org.id));
  return page<AgentStats>(members.map((u) => {
    const role = u.memberships.find((m) => m.organization_id === ctx.org.id)!.role;
    const calls = inOrg(ctx, db.calls).filter((c) => c.user_id === u.id);
    const visits = inOrg(ctx, db.visits).filter((v) => v.user_id === u.id);
    const leads = inOrg(ctx, db.leads);
    return {
      user_id: u.id, full_name: u.full_name, role,
      calls: calls.length,
      hot_leads: leads.filter((l) => l.marketing_user_id === u.id && l.temperature === 'hot').length,
      handed_over: calls.filter((c) => c.handed_over).length,
      visits_done: visits.filter((v) => v.status === 'completed').length,
      conversions: leads.filter((l) => l.status === 'converted' && (l.sales_user_id === u.id || l.marketing_user_id === u.id)).length,
      replies: db.messages.filter((m) => m.sender_user_id === u.id).length,
      escalations_resolved: inOrg(ctx, db.escalations).filter((e) => e.assigned_user_id === u.id && e.status === 'resolved').length,
      median_takeover_seconds: 0,
      followups_completed: inOrg(ctx, db.followups).filter((f) => f.assigned_user_id === u.id && f.status === 'completed').length,
    };
  }).filter((x) => x.role !== 'admin'));
});

// ---------- notifications ----------
on('GET', '/notifications', (ctx, _p, _b, q) => {
  const unread = q.get('unread') === 'true';
  return page(db.notifications.filter((x) => x.user_id === ctx.user.id && x.organization_id === ctx.org.id && (!unread || !x.read_at))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20));
});
on('POST', '/notifications/:id/read', (ctx, [id]) => {
  const x = db.notifications.find((n) => n.id === id && n.user_id === ctx.user.id);
  if (!x) fail(404, 'NOT_FOUND', 'Not found');
  x!.read_at = new Date().toISOString();
  return null;
});
on('POST', '/notifications/read-all', (ctx) => {
  db.notifications.filter((n) => n.user_id === ctx.user.id && n.organization_id === ctx.org.id && !n.read_at).forEach((n) => (n.read_at = new Date().toISOString()));
  return null;
});

// ---------- users (per workspace) ----------
const userView = (ctx: Ctx, u: MockUser) => ({ id: u.id, email: u.email, full_name: u.full_name, is_active: u.is_active, created_at: u.created_at,
  role: u.memberships.find((m) => m.organization_id === ctx.org.id)?.role ?? u.role,
  manager_id: u.memberships.find((m) => m.organization_id === ctx.org.id)?.manager_id ?? null });
/** An executive can only report to the manager of their own team. */
function checkManager(ctx: Ctx, role: Role, manager_id: string | null | undefined) {
  if (!manager_id) return null;
  const team: Team | null = role === 'marketing_executive' ? 'marketing' : role === 'sales_executive' ? 'sales' : null;
  if (!team) fail(400, 'VALIDATION_ERROR', 'Only executives report to a manager');
  if (memberRole(ctx.org.id, manager_id) !== managerRole[team!]) fail(400, 'VALIDATION_ERROR', `Pick a ${team} manager`);
  return manager_id;
}
on('GET', '/users', (ctx) => {
  // Every staff member can read the directory (needed for assignee pickers); only admins can change it.
  return page(db.users.filter((u) => u.memberships.some((m) => m.organization_id === ctx.org.id)).map((u) => userView(ctx, u)));
});
on('POST', '/users', (ctx, _p, b) => {
  need(ctx, 'user.manage');
  if (!b.email || !b.full_name) fail(400, 'VALIDATION_ERROR', 'Name and email are required');
  const existing = db.users.find((u) => u.email.toLowerCase() === String(b.email).toLowerCase());
  if (existing) {
    if (existing.memberships.some((m) => m.organization_id === ctx.org.id)) fail(409, 'CONFLICT', 'That person is already in this workspace');
    existing.memberships.push({ organization_id: ctx.org.id, role: b.role ?? 'marketing_executive', manager_id: checkManager(ctx, b.role ?? 'marketing_executive', b.manager_id) });
    return userView(ctx, existing);
  }
  if (String(b.password ?? '').length < 10) fail(400, 'VALIDATION_ERROR', 'Password must be at least 10 characters');
  const u: MockUser = { id: uid('u'), email: b.email, full_name: b.full_name, role: b.role ?? 'marketing_executive', is_active: true, created_at: new Date().toISOString(),
    password: b.password, memberships: [{ organization_id: ctx.org.id, role: b.role ?? 'marketing_executive', manager_id: checkManager(ctx, b.role ?? 'marketing_executive', b.manager_id) }] };
  db.users.push(u);
  return userView(ctx, u);
});
on('PATCH', '/users/:id', (ctx, [id], b) => {
  need(ctx, 'user.manage');
  const u = db.users.find((x) => x.id === id && x.memberships.some((m) => m.organization_id === ctx.org.id));
  if (!u) fail(404, 'NOT_FOUND', 'Not found');
  if (id === ctx.user.id && (b.is_active === false || (b.role && b.role !== 'admin'))) fail(400, 'VALIDATION_ERROR', 'You cannot deactivate or demote yourself');
  const mem = u!.memberships.find((m) => m.organization_id === ctx.org.id)!;
  if (b.role && b.role !== mem.role) {
    mem.role = b.role;
    mem.manager_id = null; // a new role means a new team
    // people who reported to this person no longer have a manager
    db.users.forEach((x) => x.memberships.forEach((m) => { if (m.organization_id === ctx.org.id && m.manager_id === id) m.manager_id = null; }));
  }
  if (b.manager_id !== undefined) mem.manager_id = checkManager(ctx, mem.role, b.manager_id);
  if (b.is_active !== undefined) u!.is_active = b.is_active;
  if (b.full_name) u!.full_name = b.full_name;
  return userView(ctx, u!);
});

// ---------- dev helper ----------
on('POST', '/dev/reset', () => { resetMockDb(); return null; });

function pick<T extends object>(src: any, keys: (keyof T | string)[]): Partial<T> {
  const out: any = {};
  for (const k of keys) if (src && src[k as string] !== undefined) out[k] = src[k as string];
  return out;
}
