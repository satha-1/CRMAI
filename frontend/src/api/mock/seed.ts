// Fictional seed data for two tenant companies. Northline Services follows docs/ai/DEMO-SCENARIOS.md;
// Northstar Realty follows the UI mockups. Dates are relative to "now" so the demo always looks current.
import type {
  AiAction, CallLog, Conversation, Customer, SiteVisit, CustomerContact, Escalation, FollowUp, KnowledgeDocument,
  Lead, Message, Notification, Organization, Role, Task, TimelineItem, User,
} from '../types';

export interface MockUser extends Omit<User, 'manager_id'> { password: string; memberships: { organization_id: string; role: Role; manager_id?: string | null }[] }
export interface DB {
  version: number;
  orgs: Organization[];
  users: MockUser[];
  customers: Customer[];
  contacts: (CustomerContact & { customer_id: string })[];
  leads: Lead[];
  calls: CallLog[];
  visits: SiteVisit[];
  conversations: Conversation[];
  messages: (Message & { simulated?: boolean })[];
  ai_actions: (AiAction & { id: string; conversation_id: string })[];
  followups: FollowUp[];
  tasks: Task[];
  escalations: Escalation[];
  knowledge: KnowledgeDocument[];
  timeline: (TimelineItem & { customer_id: string; organization_id: string })[];
  notifications: (Notification & { user_id: string; organization_id: string })[];
  widget_sessions: { id: string; organization_id: string; customer_id: string; conversation_id: string }[];
  /** Synthetic daily history so charts are not empty in the demo. */
  history: Record<string, { leads: number; escalations: number; inbound: number }[]>;
}

let n = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const H = 3600_000;
export const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * H).toISOString();
const tomorrowAt = (h: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d.toISOString(); };

export function buildSeed(): DB {
  const NL = 'org_northline';
  const NS = 'org_northstar';
  const db: DB = {
    version: 5,
    orgs: [
      {
        id: NL, name: 'Northline Services', industry: 'Subscription services', plan: 'growth',
        widget_key: 'wk_northline_demo', timezone: 'Asia/Colombo', product_label: 'package',
        channels: [
          { code: 'website', is_enabled: true }, { code: 'email', is_enabled: true },
          { code: 'whatsapp', is_enabled: false }, { code: 'facebook', is_enabled: false },
          { code: 'instagram', is_enabled: false }, { code: 'voice', is_enabled: false },
        ],
        created_at: iso(-24 * 120),
      },
      {
        id: NS, name: 'Northstar Realty', industry: 'Real estate', plan: 'starter',
        widget_key: 'wk_northstar_demo', timezone: 'Asia/Colombo', product_label: 'property',
        channels: [
          { code: 'website', is_enabled: true }, { code: 'email', is_enabled: false },
          { code: 'whatsapp', is_enabled: false }, { code: 'facebook', is_enabled: false },
          { code: 'instagram', is_enabled: false }, { code: 'voice', is_enabled: false },
        ],
        created_at: iso(-24 * 40),
      },
    ],
    users: [
      { id: 'u_admin', email: 'admin@crmai.example', full_name: 'Nimal Silva', role: 'admin', is_active: true, created_at: iso(-24 * 120), password: 'password123', memberships: [{ organization_id: NL, role: 'admin' }, { organization_id: NS, role: 'admin' }] },
      { id: 'u_ajith', email: 'marketing.manager@crmai.example', full_name: 'Ajith Perera', role: 'marketing_manager', is_active: true, created_at: iso(-24 * 100), password: 'password123', memberships: [{ organization_id: NL, role: 'marketing_manager' }, { organization_id: NS, role: 'marketing_manager' }] },
      { id: 'u_sara', email: 'marketing.exec@crmai.example', full_name: 'Sara Kim', role: 'marketing_executive', is_active: true, created_at: iso(-24 * 90), password: 'password123', memberships: [{ organization_id: NL, role: 'marketing_executive', manager_id: 'u_ajith' }, { organization_id: NS, role: 'marketing_executive', manager_id: 'u_ajith' }] },
      { id: 'u_jesse', email: 'jesse@crmai.example', full_name: 'Jesse Tan', role: 'marketing_executive', is_active: true, created_at: iso(-24 * 30), password: 'password123', memberships: [{ organization_id: NL, role: 'marketing_executive', manager_id: 'u_ajith' }, { organization_id: NS, role: 'marketing_executive', manager_id: 'u_ajith' }] },
      { id: 'u_dilani', email: 'sales.manager@crmai.example', full_name: 'Dilani Wickrama', role: 'sales_manager', is_active: true, created_at: iso(-24 * 95), password: 'password123', memberships: [{ organization_id: NL, role: 'sales_manager' }, { organization_id: NS, role: 'sales_manager' }] },
      { id: 'u_kasun', email: 'sales.exec@crmai.example', full_name: 'Kasun Fernando', role: 'sales_executive', is_active: true, created_at: iso(-24 * 60), password: 'password123', memberships: [{ organization_id: NL, role: 'sales_executive', manager_id: 'u_dilani' }, { organization_id: NS, role: 'sales_executive', manager_id: 'u_dilani' }] },
      { id: 'u_ishara', email: 'ishara@crmai.example', full_name: 'Ishara Silva', role: 'sales_executive', is_active: true, created_at: iso(-24 * 20), password: 'password123', memberships: [{ organization_id: NL, role: 'sales_executive', manager_id: 'u_dilani' }, { organization_id: NS, role: 'sales_executive', manager_id: 'u_dilani' }] },
    ],
    customers: [], contacts: [], leads: [], calls: [], visits: [], conversations: [], messages: [], ai_actions: [],
    followups: [], tasks: [], escalations: [], knowledge: [], timeline: [], notifications: [],
    widget_sessions: [], history: {},
  };

  // ---------- helpers ----------
  const customer = (org: string, full_name: string, extra: Partial<Customer> = {}, hoursAgo = 72): Customer => {
    const c: Customer = {
      id: uid('cus'), organization_id: org, full_name, primary_email: null, primary_phone: null,
      status: 'active', company_name: null, preferred_channel: 'website', notes: '', owner_user_id: null,
      created_at: iso(-hoursAgo), updated_at: iso(-hoursAgo + 1), ...extra,
    };
    db.customers.push(c);
    ev(org, c.id, 'first_contact', 'First contact on website chat', -hoursAgo, 'system');
    return c;
  };
  const ev = (org: string, customer_id: string, event_type: TimelineItem['event_type'], summary: string, hours: number,
    actor_type: TimelineItem['actor_type'], extra: Partial<TimelineItem> = {}) => {
    db.timeline.push({ id: uid('evt'), organization_id: org, customer_id, event_type, summary, occurred_at: iso(hours),
      channel: 'website', actor_type, actor_name: null, visibility: 'customer_safe', ...extra });
  };
  const convo = (org: string, c: Customer, extra: Partial<Conversation> = {}): Conversation => {
    const v: Conversation = {
      id: uid('cnv'), organization_id: org, customer_id: c.id, channel: 'website', status: 'open',
      assigned_user_id: null, assigned_user_name: null, ai_enabled: true, locked_by_user_id: null,
      locked_by_name: null, subject: null, last_message_at: iso(-1), ...extra,
    };
    db.conversations.push(v);
    return v;
  };
  const msgs = (cv: Conversation, startHours: number, lines: [Message['sender_type'], string, string?][]) => {
    lines.forEach(([sender_type, content, sender_name], i) => {
      db.messages.push({
        id: uid('msg'), conversation_id: cv.id, direction: sender_type === 'customer' ? 'inbound' : 'outbound',
        sender_type, sender_user_id: sender_type === 'staff' ? 'u_ajith' : null, sender_name: sender_name ?? null,
        message_type: sender_type === 'system' ? 'system' : 'text', content, created_at: iso(startHours + i * 0.02),
      });
    });
    cv.last_message_at = iso(startHours + (lines.length - 1) * 0.02);
  };
  const act = (cv: Conversation, hours: number, intent: string, tool_name: string | null, decision: AiAction['decision'],
    confidence = 0.86, tool_status: AiAction['tool_status'] = tool_name ? 'success' : 'not_applicable', reason: string | null = null) =>
    db.ai_actions.push({ id: uid('act'), conversation_id: cv.id, intent, tool_name, tool_status, confidence_final: confidence,
      decision, escalation_reason: reason, created_at: iso(hours) });
  const lead = (org: string, c: Customer, title: string, product: string, status: Lead['status'], value: number | null,
    hours: number, extra: Partial<Lead> = {}): Lead => {
    const l: Lead = { id: uid('lead'), organization_id: org, customer_id: c.id, conversation_id: null, title, product_name: product,
      source_channel: 'website', status, interest_summary: `Interested in ${product}`, estimated_value: value,
      assigned_user_id: null, marketing_user_id: null, sales_user_id: null, temperature: null, call_count: 0, last_call_at: null,
      next_call_at: null, handed_over_at: null, created_actor_type: 'ai_agent', created_at: iso(hours), updated_at: iso(hours + 1), ...extra };
    l.assigned_user_id = l.sales_user_id ?? l.marketing_user_id;
    db.leads.push(l);
    ev(org, c.id, 'lead_created', `Lead created: ${title}`, hours, l.created_actor_type, { lead_id: l.id, actor_name: l.created_actor_type === 'ai_agent' ? 'AI agent' : 'Ajith Perera' });
    return l;
  };
  const call = (l: Lead, user_id: string, hours: number, outcome: CallLog['outcome'], temperature: CallLog['temperature'], notes: string, handed_over = false) => {
    db.calls.push({ id: uid('call'), organization_id: l.organization_id, lead_id: l.id, customer_id: l.customer_id, user_id, outcome, temperature,
      notes, next_call_at: null, handed_over, created_at: iso(hours) });
    l.call_count += 1;
    l.last_call_at = iso(hours);
  };
  const visit = (l: Lead, user_id: string, hours: number, location: string, status: SiteVisit['status'] = 'scheduled', outcome: SiteVisit['outcome'] = null, notes = '') =>
    db.visits.push({ id: uid('vis'), organization_id: l.organization_id, lead_id: l.id, customer_id: l.customer_id, user_id, scheduled_at: iso(hours),
      location, status, outcome, notes, completed_at: status === 'completed' ? iso(hours + 1) : null,
      assigned_by: 'u_dilani', manager_notes: '', started_at: status === 'completed' ? iso(hours - 0.5) : null, checked_in_at: status === 'completed' ? iso(hours) : null,
      interest_level: status === 'completed' ? (outcome === 'not_interested' ? 'low' : outcome === 'interested' ? 'medium' : 'high') : null,
      feedback: status === 'completed' ? notes : '', next_step: '', follow_up_at: null, reschedule_reason: null });
  const doc = (org: string, title: string, source_type: KnowledgeDocument['source_type'], body: string, status: KnowledgeDocument['status'] = 'published') =>
    db.knowledge.push({ id: uid('kdoc'), organization_id: org, title, source_type, body, status,
      version: status === 'draft' ? 0 : 1, chunk_count: status === 'published' ? Math.max(1, Math.ceil(body.length / 400)) : 0, updated_at: iso(-24 * 5) });

  // ================= Northline Services (docs demo scenarios) =================
  doc(NL, 'Premium package', 'product', 'The Premium package includes priority support with a 2-hour response target, a dedicated account manager, monthly usage reviews and unlimited service requests. It suits businesses with more than 20 staff.');
  doc(NL, 'Package pricing', 'pricing', 'Premium costs LKR 45,000 per month. Standard costs LKR 18,000 per month. Basic costs LKR 7,500 per month. Prices exclude VAT. Annual billing gives two months free.');
  doc(NL, 'Refund policy', 'policy', 'Refunds and billing disputes are handled by our staff, not by the chat assistant. A staff member reviews the charge and replies within one business day. Approved refunds are returned to the original payment method.');
  doc(NL, 'Support hours', 'faq', 'Our support team is available Monday to Friday, 8:30 AM to 6:00 PM (Asia/Colombo). Website chat is answered by our AI assistant at all times and hands over to staff when needed.');
  doc(NL, 'Standard package', 'product', 'The Standard package includes email support with a next-business-day response target, quarterly reviews and up to 30 service requests per month.');
  doc(NL, 'Onboarding checklist (draft)', 'support', 'Step 1: kickoff call. Step 2: data import. Step 3: training session.', 'draft');

  const amina = customer(NL, 'Amina Shah', { primary_email: 'amina@example.com', primary_phone: '+94 77 123 4567', owner_user_id: 'u_sara' }, 26);
  db.contacts.push({ id: uid('cc'), customer_id: amina.id, channel: 'website', external_identity: 'visitor-8f21', is_verified: false },
    { id: uid('cc'), customer_id: amina.id, channel: 'email', external_identity: 'amina@example.com', is_verified: true });
  const cA = convo(NL, amina, { subject: 'Premium package', assigned_user_id: 'u_sara', assigned_user_name: 'Sara Kim' });
  ev(NL, amina.id, 'inquiry', 'Inquiry on website: Premium package', -25.9, 'system', { conversation_id: cA.id });
  msgs(cA, -25.9, [
    ['customer', 'I am interested in your premium package. Can someone contact me tomorrow afternoon? My name is Amina Shah and my email is amina@example.com.'],
    ['ai_agent', 'Thanks, Amina. The Premium package includes priority support with a 2-hour response target, a dedicated account manager and monthly usage reviews. I have noted your interest and scheduled a call for tomorrow at 14:00. We will contact you at amina@example.com.'],
  ]);
  act(cA, -25.88, 'lead_request', 'search_knowledge', 'tool', 0.91);
  act(cA, -25.88, 'lead_request', 'update_customer', 'tool', 0.91);
  const lA = lead(NL, amina, 'Premium package', 'Premium', 'contacted', 540000, -25.88, { conversation_id: cA.id, marketing_user_id: 'u_sara', temperature: 'hot', next_call_at: tomorrowAt(14) });
  call(lA, 'u_sara', -20, 'answered', 'hot', 'Very keen on Premium for 25 staff. Wants a call tomorrow 2pm with pricing.');
  act(cA, -25.88, 'lead_request', 'create_lead', 'tool', 0.91);
  db.followups.push({ id: uid('fu'), organization_id: NL, customer_id: amina.id, lead_id: lA.id, conversation_id: cA.id, scheduled_at: tomorrowAt(14),
    channel: 'email', reason: 'Call about Premium package', status: 'scheduled', assigned_user_id: 'u_sara', created_actor_type: 'ai_agent' });
  ev(NL, amina.id, 'follow_up_scheduled', 'Follow-up scheduled: tomorrow 14:00', -25.87, 'ai_agent', { actor_name: 'AI agent', lead_id: lA.id });
  act(cA, -25.87, 'follow_up_request', 'create_followup', 'respond', 0.88);
  msgs(cA, -2, [['customer', 'Yes, Premium is the one I want, and you can use this email.'],
    ['ai_agent', 'Great — I have marked your Premium request as qualified. Our team will call you tomorrow at 14:00 as planned.']]);
  act(cA, -1.98, 'lead_request', 'update_lead', 'respond', 0.87);
  ev(NL, amina.id, 'qualification', 'Lead qualified: Premium package', -1.98, 'ai_agent', { actor_name: 'AI agent', lead_id: lA.id });

  const daniel = customer(NL, 'Daniel Reyes', { primary_email: 'daniel.reyes@example.com', company_name: 'Riverside Homes' }, 5);
  const cD = convo(NL, daniel, { status: 'pending_human', ai_enabled: false, subject: 'Incorrect charge' });
  ev(NL, daniel.id, 'inquiry', 'Inquiry on website: billing', -4.9, 'system', { conversation_id: cD.id });
  msgs(cD, -0.4, [
    ['customer', 'I was charged incorrectly and I want a refund.'],
    ['ai_agent', 'Refunds and billing disputes are handled by our staff, who review the charge and reply within one business day.'],
    ['system', 'A staff member will continue this conversation. You can keep writing here.'],
  ]);
  act(cD, -0.39, 'refund_or_billing', 'search_knowledge', 'tool', 0.93);
  act(cD, -0.38, 'refund_or_billing', 'escalate_to_human', 'escalate', 0.93, 'success', 'billing_requires_human');
  const eD: Escalation = { id: uid('esc'), organization_id: NL, conversation_id: cD.id, customer_id: daniel.id, reason_code: 'billing_requires_human',
    reason_detail: 'Customer reports an incorrect charge and requests a refund.', priority: 'urgent', status: 'open', triggered_by: 'policy',
    assigned_user_id: null, sla_due_at: iso(-0.38 + 0.25), created_at: iso(-0.38), resolved_at: null };
  db.escalations.push(eD);
  ev(NL, daniel.id, 'escalation', 'Escalated: billing requires human (urgent)', -0.38, 'ai_agent', { actor_name: 'AI agent', escalation_id: eD.id });

  const elena = customer(NL, 'Elena Holt', { primary_email: 'elena@maplegrove.example', company_name: 'Maple Grove Group' }, 50);
  const cE = convo(NL, elena, { status: 'assigned', ai_enabled: false, assigned_user_id: 'u_ajith', assigned_user_name: 'Ajith Perera', locked_by_user_id: 'u_ajith', locked_by_name: 'Ajith Perera', subject: 'Service failure complaint' });
  msgs(cE, -3, [
    ['customer', 'This is the third time your service failed. I will contact my lawyer.'],
    ['system', 'A staff member will continue this conversation. You can keep writing here.'],
    ['staff', 'Hi Elena, this is Ajith from Northline. I am sorry about the repeated failures. I am reviewing your account now and will call you within the hour.', 'Ajith Perera'],
    ['customer', 'Thank you. Please call 077 555 0184.'],
  ]);
  act(cE, -2.99, 'complaint', 'escalate_to_human', 'escalate', 0.95, 'success', 'sensitive_complaint');
  act(cE, -2.98, 'complaint', 'create_support_task', 'tool', 0.95);
  const eE: Escalation = { id: uid('esc'), organization_id: NL, conversation_id: cE.id, customer_id: elena.id, reason_code: 'sensitive_complaint',
    reason_detail: 'Angry complaint mentioning legal action.', priority: 'urgent', status: 'in_progress', triggered_by: 'ai_agent',
    assigned_user_id: 'u_ajith', sla_due_at: iso(-2.75), created_at: iso(-2.99), resolved_at: null };
  db.escalations.push(eE);
  ev(NL, elena.id, 'complaint', 'Complaint: repeated service failure', -2.99, 'ai_agent', { actor_name: 'AI agent' });
  ev(NL, elena.id, 'escalation', 'Escalated: sensitive complaint (urgent)', -2.99, 'ai_agent', { actor_name: 'AI agent', escalation_id: eE.id });
  db.tasks.push({ id: uid('task'), organization_id: NL, title: 'Investigate repeated service failures for Maple Grove', description: 'Created by the AI agent from a complaint. Check incident log for the last 30 days.',
    priority: 'high', status: 'in_progress', customer_id: elena.id, assigned_user_id: 'u_ajith', due_at: iso(4), created_actor_type: 'ai_agent' });

  const avery = customer(NL, 'Avery Lim', { primary_email: 'avery@pinecrest.example', company_name: 'Pinecrest Capital', owner_user_id: 'u_jesse' }, 24 * 6);
  const lAv = lead(NL, avery, 'Standard package for 12 staff', 'Standard', 'contacted', 216000, -24 * 6 + 1, { marketing_user_id: 'u_jesse', temperature: 'warm', next_call_at: iso(3) });
  call(lAv, 'u_jesse', -24 * 5, 'no_answer', null, 'No answer, left voicemail.');
  call(lAv, 'u_jesse', -24 * 2, 'answered', 'warm', 'Comparing with a competitor. Call back with proposal.');
  db.followups.push({ id: uid('fu'), organization_id: NL, customer_id: avery.id, lead_id: lAv.id, conversation_id: null, scheduled_at: iso(3),
    channel: 'voice', reason: 'Send Standard package proposal', status: 'scheduled', assigned_user_id: 'u_jesse', created_actor_type: 'user' });
  const cAv = convo(NL, avery, { subject: 'Standard vs Premium', status: 'resolved', last_message_at: iso(-24 * 6) });
  msgs(cAv, -24 * 6, [['customer', 'What is the difference between Standard and Premium?'], ['ai_agent', 'Standard includes email support with a next-business-day response target and up to 30 requests a month. Premium adds priority support with a 2-hour target and a dedicated account manager.']]);
  act(cAv, -24 * 6, 'faq', 'search_knowledge', 'respond', 0.9);

  const carlos = customer(NL, 'Carlos Santos', { primary_email: 'carlos@bayline.example', company_name: 'Bayline Investments', owner_user_id: 'u_ajith' }, 24 * 12);
  const lC = lead(NL, carlos, 'Premium package (annual)', 'Premium', 'converted', 450000, -24 * 12 + 2, { marketing_user_id: 'u_sara', sales_user_id: 'u_kasun', temperature: 'hot', handed_over_at: iso(-24 * 10) });
  call(lC, 'u_sara', -24 * 10.5, 'answered', 'hot', 'Ready to buy annual Premium. Handed to sales.', true);
  visit(lC, 'u_kasun', -24 * 6, 'Bayline Investments office, Colombo 03', 'completed', 'booked', 'Demo at their office. Signed annual contract.');
  ev(NL, carlos.id, 'conversion', 'Lead converted: Premium package (annual)', -24 * 3, 'user', { actor_name: 'Ajith Perera', lead_id: lC.id });
  ev(NL, carlos.id, 'purchase', 'Purchase confirmed by staff', -24 * 3, 'user', { actor_name: 'Ajith Perera', lead_id: lC.id });
  db.followups.push({ id: uid('fu'), organization_id: NL, customer_id: carlos.id, lead_id: lC.id, conversation_id: null, scheduled_at: iso(-24 * 4),
    channel: 'voice', reason: 'Contract walkthrough', status: 'completed', assigned_user_id: 'u_ajith', created_actor_type: 'user', completed_at: iso(-24 * 4) });

  const noah = customer(NL, 'Website visitor 4c1e', { status: 'provisional', preferred_channel: 'website' }, 1);
  const cN = convo(NL, noah, { subject: null, last_message_at: iso(-0.9) });
  msgs(cN, -0.95, [['customer', 'What are your support hours?'], ['ai_agent', 'Our support team is available Monday to Friday, 8:30 AM to 6:00 PM (Colombo time). This chat is answered by our AI assistant at any time.']]);
  act(cN, -0.94, 'faq', 'search_knowledge', 'respond', 0.94);

  const priya = customer(NL, 'Priya Nadarajah', { primary_email: 'priya@lakeshore.example', company_name: 'Lakeshore Realty' }, 24 * 9);
  const lP = lead(NL, priya, 'Basic package', 'Basic', 'lost', 90000, -24 * 9, { created_actor_type: 'user', marketing_user_id: 'u_jesse', temperature: 'cold' });
  call(lP, 'u_jesse', -24 * 8, 'answered', 'cold', 'Budget too low this year.');
  void lP;
  const cP = convo(NL, priya, { status: 'open', channel: 'email', subject: 'Following up', simulated: true, last_message_at: iso(-6) });
  msgs(cP, -6, [['customer', 'Hi, following up on the Basic plan. Can you resend the invoice?'], ['ai_agent', 'I cannot send invoices from chat. I have created a task for our billing team to resend it to priya@lakeshore.example.']]);
  act(cP, -5.99, 'support_request', 'create_support_task', 'respond', 0.81);
  db.tasks.push({ id: uid('task'), organization_id: NL, title: 'Resend Basic plan invoice to Priya', description: 'Requested over email.', priority: 'medium', status: 'open', customer_id: priya.id, assigned_user_id: 'u_sara', due_at: iso(20), created_actor_type: 'ai_agent' },
    { id: uid('task'), organization_id: NL, title: 'Prepare Premium onboarding pack', description: null, priority: 'low', status: 'open', customer_id: carlos.id, assigned_user_id: 'u_sara', due_at: iso(48), created_actor_type: 'user' },
    { id: uid('task'), organization_id: NL, title: 'Review knowledge article: refund policy wording', description: 'Customers ask about refund timing often.', priority: 'medium', status: 'done', customer_id: null, assigned_user_id: 'u_ajith', due_at: iso(-30), created_actor_type: 'user' });

  const nlNew = (name: string, email: string, phone: string, product: string, value: number, hours: number, extra: Partial<Lead> = {}) => {
    const c = customer(NL, name, { primary_email: email, primary_phone: phone }, -hours + 1);
    return lead(NL, c, `${product} package`, product, 'new', value, hours, extra);
  };
  nlNew('Kavindu Rajapaksa', 'kavindu@example.com', '+94 77 410 2231', 'Premium', 540000, -3);
  nlNew('Fathima Rizvi', 'fathima@example.com', '+94 76 552 9810', 'Standard', 216000, -5);
  nlNew('Tharindu Gamage', 'tharindu@example.com', '+94 71 220 4467', 'Basic', 90000, -8);
  const nlH = nlNew('Shanika Dias', 'shanika@example.com', '+94 77 908 1123', 'Premium', 540000, -24 * 4, { marketing_user_id: 'u_sara', temperature: 'hot', status: 'qualified', handed_over_at: iso(-24 * 1) });
  call(nlH, 'u_sara', -24 * 1.1, 'answered', 'hot', 'Wants an on-site demo at their office next week.', true);
  // Kasun's day: one visit already past (report not written yet) and one later today
  const nlV1 = nlNew('Ruwan Jayasuriya', 'ruwan@harborlogistics.example', '+94 77 301 7788', 'Premium', 540000, -24 * 5,
    { marketing_user_id: 'u_sara', sales_user_id: 'u_kasun', temperature: 'hot', status: 'site_visit', handed_over_at: iso(-24 * 3) });
  call(nlV1, 'u_sara', -24 * 3.2, 'answered', 'hot', '40 staff, unhappy with current provider. Decision maker is the COO.', true);
  visit(nlV1, 'u_kasun', -1.5, 'Harbor Logistics HQ, 22 Marine Drive, Colombo 03');
  const nlV2 = nlNew('Dinusha Herath', 'dinusha@greenleaf.example', '+94 71 845 2290', 'Standard', 216000, -24 * 4,
    { marketing_user_id: 'u_jesse', sales_user_id: 'u_kasun', temperature: 'warm', status: 'site_visit', handed_over_at: iso(-24 * 2) });
  call(nlV2, 'u_jesse', -24 * 2.1, 'answered', 'warm', 'Interested but wants to see the dashboard live. Budget approved for Q1.', true);
  visit(nlV2, 'u_kasun', 2.5, 'Greenleaf Foods, 145 Kandy Road, Kiribathgoda');
  db.visits[db.visits.length - 1].manager_notes = 'Bring the Standard vs Premium comparison sheet. Ask for the IT manager.';

  // ================= Northstar Realty (UI mockups) =================
  doc(NS, 'Harbor View (A-1203)', 'product', 'Harbor View, Colombo. Unit A-1203: 3 bed, 2 bath apartment, 1,450 sq ft, sea view. Two covered parking slots available at LKR 2.5M each. Asking price $1.24M.');
  doc(NS, 'Lakeside Residences', 'product', 'Lakeside Residences: 2 and 3 bed apartments from $1.05M, lake-facing, gym and pool. Completion Q2 2027.');
  doc(NS, 'Viewing policy', 'policy', 'Viewings are available Tuesday to Sunday, 10 AM to 5 PM. A staff member confirms each viewing. Offers and price negotiations are always handled by a staff agent.');
  doc(NS, 'Office hours', 'faq', 'Our office is open Monday to Saturday, 9 AM to 6 PM. Website chat is available at all times.');
  const nsDeal = (name: string, email: string, phone: string, property: string, status: Lead['status'], value: number, hours: number, extra: Partial<Lead> = {}) => {
    const c = customer(NS, name, { primary_email: email, primary_phone: phone }, -hours + 2);
    const l = lead(NS, c, property, property, status, value, hours, extra);
    return { c, l };
  };
  // Hot lead, handed over, site visit scheduled today (the mockup's Harbor View deal)
  const maya = nsDeal('Maya Fernando', 'maya@harborview.example', '(415) 555-0184', 'Harbor View', 'site_visit', 1240000, -24 * 17,
    { marketing_user_id: 'u_sara', sales_user_id: 'u_kasun', temperature: 'hot', handed_over_at: iso(-24 * 3) });
  maya.c.company_name = 'Harbor View LLC';
  maya.l.interest_summary = 'Unit A-1203, 3 bed 2 bath. Asked about parking availability, allocation and cost.';
  call(maya.l, 'u_sara', -24 * 5, 'no_answer', null, 'No answer.');
  call(maya.l, 'u_sara', -24 * 3.2, 'answered', 'hot', 'Ready to view A-1203 this week. Asked about 2 parking slots. Handed to sales.', true);
  visit(maya.l, 'u_kasun', 3, 'Harbor View, Colombo — Unit A-1203');
  const cM = convo(NS, maya.c, { subject: 'Harbor View A-1203', assigned_user_id: 'u_sara', assigned_user_name: 'Sara Kim' });
  msgs(cM, -3, [['customer', 'Is there parking with A-1203? And can I view it on Nov 22 or 23?'],
    ['ai_agent', 'Unit A-1203 has two covered parking slots available at LKR 2.5M each. I have asked our team to confirm a viewing on Nov 22 or 23 — a staff member will confirm the exact time.']]);
  act(cM, -2.99, 'viewing_request', 'create_followup', 'respond', 0.84);
  // Unassigned new leads waiting for the marketing manager
  nsDeal('Daniel Cho', 'daniel.cho@example.com', '+94 71 330 1290', 'Riverside', 'new', 890000, -6);
  nsDeal('Erin Park', 'erin@example.com', '+94 77 645 0021', 'Maple Grove', 'new', 720000, -10);
  nsDeal('James Miller', 'james@example.com', '+94 76 118 7745', 'Hillcrest', 'new', 960000, -30);
  // With marketing executives: not called yet / being called
  nsDeal('Nadeesha Perera', 'nadeesha@example.com', '+94 70 552 3310', 'Lakeside', 'new', 1050000, -20, { marketing_user_id: 'u_sara' });
  const v = nsDeal('Victor Tan', 'victor@example.com', '+94 77 731 9902', 'Lakeside', 'contacted', 1050000, -24 * 5, { marketing_user_id: 'u_jesse', temperature: 'warm', next_call_at: iso(-1) });
  call(v.l, 'u_jesse', -24 * 2, 'answered', 'warm', 'Likes Lakeside but waiting on loan approval. Call back.');
  const o = nsDeal('Olivia Reyes', 'olivia@example.com', '+94 71 902 4418', 'Pine Terrace', 'contacted', 600000, -24 * 6, { marketing_user_id: 'u_jesse', temperature: 'cold' });
  call(o.l, 'u_jesse', -24 * 4, 'answered', 'cold', 'Just browsing, maybe next year.');
  const r = nsDeal('Ruwan Jayasuriya', 'ruwan@example.com', '+94 77 210 6654', 'Seaview', 'contacted', 1100000, -24 * 2, { marketing_user_id: 'u_sara', temperature: 'hot', next_call_at: iso(2) });
  call(r.l, 'u_sara', -24 * 1, 'answered', 'hot', 'Very interested, wants to bring spouse for a visit. Confirm date then hand over.');
  // Handed over to sales, waiting for the sales manager to assign
  const n2 = nsDeal('Natalie Brooks', 'natalie@example.com', '+94 76 404 8812', 'Seaview', 'qualified', 1100000, -24 * 9, { marketing_user_id: 'u_sara', temperature: 'hot', handed_over_at: iso(-20) });
  call(n2.l, 'u_sara', -21, 'answered', 'hot', 'Wants a site visit on Saturday.', true);
  const e2 = nsDeal('Ethan Wu', 'ethan@example.com', '+94 71 667 2290', 'Cedar Point', 'qualified', 770000, -24 * 8, { marketing_user_id: 'u_jesse', temperature: 'warm', handed_over_at: iso(-30) });
  call(e2.l, 'u_jesse', -31, 'answered', 'warm', 'Interested if price is negotiable. Visit first.', true);
  // With sales executives
  const m3 = nsDeal('Meadow Silva', 'meadow@example.com', '+94 77 845 1107', 'Meadowbrook', 'qualified', 950000, -24 * 7, { marketing_user_id: 'u_sara', sales_user_id: 'u_ishara', temperature: 'hot', handed_over_at: iso(-24 * 2) });
  call(m3.l, 'u_sara', -24 * 2.1, 'answered', 'hot', 'Ready to visit any weekday.', true);
  const b = nsDeal('Brian Fonseka', 'brian@example.com', '+94 70 990 3346', 'Baycrest', 'negotiation', 1350000, -24 * 14, { marketing_user_id: 'u_jesse', sales_user_id: 'u_kasun', temperature: 'hot', handed_over_at: iso(-24 * 8) });
  call(b.l, 'u_jesse', -24 * 8.2, 'answered', 'hot', 'Cash buyer. Handed to sales.', true);
  visit(b.l, 'u_kasun', -24 * 4, 'Baycrest, Mount Lavinia — Villa 7', 'completed', 'negotiating', 'Loved the villa, asking for a 5% discount.');
  const sc = nsDeal('Sophia Clark', 'sophia@example.com', '+94 77 300 5521', 'Baycrest', 'converted', 1350000, -24 * 20, { marketing_user_id: 'u_sara', sales_user_id: 'u_ishara', temperature: 'hot', handed_over_at: iso(-24 * 15) });
  call(sc.l, 'u_sara', -24 * 15.2, 'answered', 'hot', 'Handed to sales.', true);
  visit(sc.l, 'u_ishara', -24 * 12, 'Baycrest, Mount Lavinia — Villa 2', 'completed', 'booked', 'Paid the booking deposit.');
  const t = nsDeal('Chamari Atapattu', 'chamari@example.com', '+94 71 512 7788', 'Cedar Point', 'site_visit', 770000, -24 * 6, { marketing_user_id: 'u_sara', sales_user_id: 'u_ishara', temperature: 'warm', handed_over_at: iso(-24 * 3) });
  visit(t.l, 'u_ishara', 26, 'Cedar Point, Kandy — Show house');
  const rd = nsDeal('Ryan Delgado', 'ryan@example.com', '+94 76 221 0934', 'Meadowbrook', 'lost', 950000, -24 * 15, { marketing_user_id: 'u_jesse', sales_user_id: 'u_kasun', temperature: 'warm', handed_over_at: iso(-24 * 12) });
  visit(rd.l, 'u_kasun', -24 * 10, 'Meadowbrook — Plot 14', 'completed', 'not_interested', 'Too far from the city.');
  void e2;
  db.tasks.push({ id: uid('task'), organization_id: NS, title: 'Send Seaview floor plan', description: 'Natalie asked for the 3-bed floor plan.', priority: 'medium', status: 'open', customer_id: null, assigned_user_id: 'u_kasun', due_at: iso(30), created_actor_type: 'user' });

  // ---------- notifications ----------
  const note = (org: string, user_id: string, type: Notification['type'], title: string, body: string, entity_type: Notification['entity_type'], entity_id: string, hours: number, read = false) =>
    db.notifications.push({ id: uid('ntf'), organization_id: org, user_id, type, title, body, entity_type, entity_id, created_at: iso(hours), read_at: read ? iso(hours + 0.1) : null });
  for (const u of ['u_admin', 'u_ajith', 'u_sara', 'u_jesse']) {
    note(NL, u, 'ai_escalation', 'Urgent escalation', 'Daniel Reyes: billing requires human', 'escalation', eD.id, -0.38);
  }
  note(NL, 'u_ajith', 'new_lead', 'New lead from AI', 'Amina Shah — Premium package', 'lead', lA.id, -25.88, true);
  note(NL, 'u_admin', 'new_lead', 'New lead from AI', 'Amina Shah — Premium package', 'lead', lA.id, -25.88, true);
  note(NS, 'u_dilani', 'new_lead', 'Lead handed to sales', 'Natalie Brooks — Seaview (hot)', 'lead', n2.l.id, -20);
  note(NS, 'u_kasun', 'task_assigned', 'Site visit today', 'Maya Fernando — Harbor View A-1203', 'lead', maya.l.id, -2);
  note(NL, 'u_ajith', 'sla_warning', 'SLA passed', 'Elena Holt escalation is past its 15-minute target', 'escalation', eE.id, -2.7);

  // ---------- synthetic chart history (30 days) ----------
  const series = (seed: number, base: number) => Array.from({ length: 30 }, (_, i) => {
    const w = Math.sin((i + seed) / 3) * 0.5 + 1;
    return { leads: Math.round((base * w + (i % 4)) * 0.6), escalations: Math.round(base * 0.18 * (2 - w) + (i % 3 === 0 ? 1 : 0)), inbound: Math.round(base * 4 * w + i * 0.5) };
  });
  db.history[NL] = series(1, 6);
  db.history[NS] = series(4, 3);
  return db;
}
