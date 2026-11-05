// A scripted stand-in for the AgentOrchestrator (docs/ai/AI-ARCHITECTURE.md) so the widget demo
// works without a backend or an LLM. It follows docs/ai/DEMO-SCENARIOS.md: it writes ai_actions,
// creates leads/follow-ups via "tools", and escalates billing, complaints and human requests.
// It is deliberately simple keyword logic — the real intelligence lives in the backend.
import type { Conversation, Lead, Message, Organization } from '../types';
import type { DB } from './seed';
import { uid } from './seed';
import { journey, notify, openEscalation, searchKnowledge } from './server';

const HUMAN_PHRASES = ['talk to a human', 'real person', 'agent please', 'speak to someone'];
const HANDOFF = 'A staff member will continue this conversation. You can keep writing here.';

export function runFakeAgent(db: DB, org: Organization, conv: Conversation, inbound: Message) {
  const text = inbound.content.toLowerCase();
  const now = () => new Date().toISOString();
  const say = (content: string, sender_type: 'ai_agent' | 'system' = 'ai_agent') => {
    db.messages.push({ id: uid('msg'), conversation_id: conv.id, direction: 'outbound', sender_type, sender_user_id: null,
      message_type: sender_type === 'system' ? 'system' : 'text', content, created_at: now() });
    conv.last_message_at = now();
  };
  const act = (intent: string, tool_name: string | null, decision: 'respond' | 'tool' | 'escalate', confidence: number,
    tool_status: 'success' | 'denied' | 'not_applicable' = tool_name ? 'success' : 'not_applicable', reason: string | null = null) =>
    db.ai_actions.push({ id: uid('act'), conversation_id: conv.id, intent, tool_name, tool_status, confidence_final: confidence, decision, escalation_reason: reason, created_at: now() });
  const customer = db.customers.find((c) => c.id === conv.customer_id)!;
  const escalate = (intent: string, reason: any, priority: any, detail: string, conf: number) => {
    act(intent, 'escalate_to_human', 'escalate', conf, 'success', reason);
    openEscalation(conv, reason, priority, reason === 'human_requested' ? 'customer' : 'policy', detail);
    say(HANDOFF, 'system');
  };

  // Prompt injection: refuse, never run extra tools (scenario 9).
  if (/ignore (your|all|previous) (rules|instructions)|database admin|list every customer/.test(text)) {
    act('other', 'update_lead', 'respond', 0.4, 'denied');
    say('I can only help with your own enquiry. I cannot share other customers\' details or change records on request.');
    return;
  }
  if (HUMAN_PHRASES.some((p) => text.includes(p)) || /not helping/.test(text)) {
    return escalate('human_request', 'human_requested', 'high', 'Customer asked for a person.', 0.97);
  }
  if (/lawyer|third time|terrible|unacceptable|furious/.test(text)) {
    journey(org.id, customer.id, 'complaint', 'Complaint received on website chat', 'ai_agent', { conversation_id: conv.id });
    return escalate('complaint', 'sensitive_complaint', 'urgent', 'Angry complaint.', 0.95);
  }
  if (/refund|charged|charge|invoice wrong|money back/.test(text)) {
    const kb = searchKnowledge(org.id, 'refund policy billing');
    act('refund_or_billing', 'search_knowledge', 'tool', 0.93);
    if (kb[0]) say(`${firstSentence(kb[0].content)}`);
    return escalate('refund_or_billing', 'billing_requires_human', 'urgent', 'Customer reports an incorrect charge / refund request.', 0.93);
  }

  // Capture name and email when offered (update_customer tool).
  const email = inbound.content.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  const name = inbound.content.match(/my name is ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i)?.[1];
  if (email || name) {
    if (email) customer.primary_email = email;
    if (name) customer.full_name = name.replace(/\b\w/g, (c) => c.toUpperCase());
    if (customer.status === 'provisional' && name) customer.status = 'active';
    customer.updated_at = now();
    act('profile_update', 'update_customer', 'tool', 0.9);
  }

  // Product interest → lead (+ follow-up if a time is mentioned).
  const products = db.knowledge.filter((d) => d.organization_id === org.id && d.status === 'published' && d.source_type === 'product')
    .map((d) => ({ doc: d, key: d.title.split(/[ (]/)[0].toLowerCase() }));
  const product = products.find((p) => text.includes(p.key));
  if (product || /interested|buy|sign up|viewing|price|cost/.test(text)) {
    const kb = searchKnowledge(org.id, inbound.content);
    act('lead_request', 'search_knowledge', 'tool', 0.88);
    if (!product) {
      if (/platinum|enterprise|contract/.test(text)) {
        act('lead_request', null, 'respond', 0.5);
        say(`I do not have that ${org.product_label} in our catalogue. Our options are: ${products.map((p) => p.doc.title).join(', ')}. Would one of these suit you?`);
        return;
      }
      say(kb[0] ? kb[0].content : `Which ${org.product_label} are you interested in? We offer ${products.map((p) => p.doc.title).join(', ')}.`);
      return;
    }
    const pname = product.doc.title.replace(/ package| \(.+\)/i, '');
    let lead = db.leads.find((l) => l.customer_id === customer.id && l.product_name === pname && ['new', 'contacted', 'qualified'].includes(l.status));
    let created = false;
    if (!lead) {
      const l: Lead = { id: uid('lead'), organization_id: org.id, customer_id: customer.id, conversation_id: conv.id, title: product.doc.title, product_name: pname,
        source_channel: conv.channel, status: 'new', interest_summary: inbound.content.slice(0, 200), estimated_value: null, assigned_user_id: null,
        marketing_user_id: null, sales_user_id: null, temperature: null, call_count: 0, last_call_at: null, next_call_at: null, call_instruction: null, handed_over_at: null,
        created_actor_type: 'ai_agent', created_at: now(), updated_at: now() };
      db.leads.push(l); lead = l; created = true;
      journey(org.id, customer.id, 'lead_created', `Lead created: ${l.title}`, 'ai_agent', { lead_id: l.id, conversation_id: conv.id });
      notify(org.id, (r) => r === 'marketing_manager' || r === 'admin', { type: 'new_lead', title: 'New lead from AI', body: `${customer.full_name} — ${l.title}`, entity_type: 'lead', entity_id: l.id });
    } else if (customer.primary_email && /yes|want|this one/.test(text) && lead.status === 'new') {
      // The AI never hands a lead to sales — a marketing executive does that after a call.
      lead.interest_summary = `${lead.interest_summary}
Customer confirmed interest in chat.`; lead.updated_at = now();
      act('lead_request', 'update_lead', 'tool', 0.87);
    }
    act('lead_request', 'create_lead', 'tool', 0.88, created ? 'success' : 'not_applicable');
    let followText = '';
    if (/tomorrow|contact me|call me|viewing|next week/.test(text)) {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0);
      db.followups.push({ id: uid('fu'), organization_id: org.id, customer_id: customer.id, lead_id: lead.id, conversation_id: conv.id, scheduled_at: d.toISOString(),
        channel: customer.primary_email ? 'email' : 'website', reason: `Contact about ${product.doc.title}`, status: 'scheduled', assigned_user_id: lead.assigned_user_id, created_actor_type: 'ai_agent' });
      journey(org.id, customer.id, 'follow_up_scheduled', 'Follow-up scheduled: tomorrow 14:00', 'ai_agent', { lead_id: lead.id });
      act('follow_up_request', 'create_followup', 'tool', 0.86);
      followText = ` I have scheduled a follow-up for tomorrow at 14:00${customer.primary_email ? ` and we will contact you at ${customer.primary_email}` : ''}.`;
    }
    act('lead_request', null, 'respond', 0.86);
    say(`${firstSentence(product.doc.body)}${followText || ' I have noted your interest — would you like someone to contact you?'}`);
    return;
  }

  // FAQ path (scenario 3): answer only from published knowledge.
  const kb = searchKnowledge(org.id, inbound.content);
  if (kb[0]) {
    act('faq', 'search_knowledge', 'respond', kb[0].similarity);
    say(kb[0].content);
    return;
  }
  if (/^(hi|hello|hey)\b/.test(text)) {
    act('greeting', null, 'respond', 0.9);
    say(`Hello! I am the ${org.name} assistant. I can answer questions about our ${org.product_label}s, prices and policies, or connect you with our team.`);
    return;
  }
  // Low confidence → do not guess.
  escalate('other', 'low_confidence', 'low', 'No grounded answer found.', 0.42);
}

const firstSentence = (s: string) => (s.match(/^.+?[.!?](\s|$)/)?.[0] ?? s).trim();
