// Mirrors docs/api/API-SPECIFICATION.md. If the API changes, change this file in the same PR.
// Multi-tenant addition: every business record carries `organization_id` and every staff
// request sends `X-Organization-Id` (see README "Multi-company (SaaS) mode").

export type Uuid = string;
export type IsoDate = string;

/** Five staff roles: admin, two marketing roles (calls) and two sales roles (site visits). */
export type Role = 'admin' | 'marketing_manager' | 'marketing_executive' | 'sales_manager' | 'sales_executive';
export type Team = 'marketing' | 'sales';
export type Temperature = 'hot' | 'warm' | 'cold';
export type ActorType = 'user' | 'ai_agent' | 'system';
export type ChannelCode = 'website' | 'email' | 'whatsapp' | 'facebook' | 'instagram' | 'voice';

export type Permission =
  | 'customer.read' | 'customer.write'
  | 'lead.read' | 'lead.write' | 'lead.delete'
  | 'conversation.read' | 'conversation.reply' | 'conversation.takeover'
  | 'followup.read' | 'followup.write'
  | 'task.read' | 'task.write'
  | 'escalation.read' | 'escalation.assign'
  | 'knowledge.read' | 'knowledge.write' | 'knowledge.publish'
  | 'analytics.read' | 'user.manage' | 'audit.read' | 'notification.read'
  | 'org.manage'
  | 'lead.assign.marketing' | 'lead.assign.sales' | 'call.log' | 'visit.manage' | 'visit.assign' | 'team.performance';

export interface Page<T> { items: T[]; next_cursor: string | null }

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { field: string; issue: string }[]; request_id?: string };
}

// ---------- Tenancy ----------
export type Plan = 'trial' | 'starter' | 'growth';
export interface Organization {
  id: Uuid;
  name: string;
  industry: string;
  plan: Plan;
  widget_key: string;
  timezone: string;
  /** Words the AI uses for the sellable thing: "package", "property", "course"... */
  product_label: string;
  channels: { code: ChannelCode; is_enabled: boolean }[];
  created_at: IsoDate;
}
export interface Membership { organization: Organization; role: Role }

// ---------- Auth ----------
export interface UserSummary { id: Uuid; full_name: string; role: Role }
export interface Me {
  id: Uuid;
  email: string;
  full_name: string;
  role: Role;
  permissions: Permission[];
  memberships: Membership[];
}
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserSummary;
}

export interface User {
  id: Uuid;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: IsoDate;
  /** Executives report to one manager of their team (per workspace). */
  manager_id: Uuid | null;
}

// ---------- CRM ----------
export type CustomerStatus = 'provisional' | 'active' | 'inactive';
export interface Customer {
  id: Uuid;
  organization_id: Uuid;
  full_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  status: CustomerStatus;
  company_name: string | null;
  preferred_channel: ChannelCode | null;
  notes: string;
  owner_user_id: Uuid | null;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface CustomerContact { id: Uuid; channel: ChannelCode; external_identity: string; is_verified: boolean }

export type JourneyEvent =
  | 'first_contact' | 'inquiry' | 'lead_created' | 'qualification' | 'follow_up_scheduled'
  | 'follow_up_completed' | 'conversion' | 'purchase' | 'support' | 'complaint'
  | 'escalation' | 'resolution' | 'channel_switch' | 'profile_updated';

export interface TimelineItem {
  id: Uuid;
  event_type: JourneyEvent;
  summary: string;
  occurred_at: IsoDate;
  channel: ChannelCode | null;
  actor_type: ActorType;
  actor_name?: string | null;
  visibility: 'customer_safe' | 'staff';
  lead_id?: Uuid | null;
  conversation_id?: Uuid | null;
  escalation_id?: Uuid | null;
}

/**
 * new         – not called yet (marketing)
 * contacted   – marketing executive has called; temperature set
 * qualified   – handed over to sales, waiting for / assigned to a sales executive
 * site_visit  – a site visit is scheduled or done
 * negotiation – customer is negotiating after the visit
 * converted / lost / unqualified – closed
 */
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'site_visit' | 'negotiation' | 'unqualified' | 'converted' | 'lost';
export interface Lead {
  id: Uuid;
  organization_id: Uuid;
  customer_id: Uuid;
  conversation_id: Uuid | null;
  title: string;
  product_name: string | null;
  source_channel: ChannelCode;
  status: LeadStatus;
  interest_summary: string;
  estimated_value: number | null;
  /** Current owner: the sales executive once handed over, otherwise the marketing executive. */
  assigned_user_id: Uuid | null;
  marketing_user_id: Uuid | null;
  sales_user_id: Uuid | null;
  temperature: Temperature | null;
  call_count: number;
  last_call_at: IsoDate | null;
  next_call_at: IsoDate | null;
  /** Set by the marketing manager on "Assign calls"; cleared when the call is logged. */
  call_instruction: string | null;
  handed_over_at: IsoDate | null;
  created_actor_type: ActorType;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'wrong_number' | 'call_back';
export interface CallLog {
  id: Uuid;
  organization_id: Uuid;
  lead_id: Uuid;
  customer_id: Uuid;
  user_id: Uuid;
  user_name?: string;
  outcome: CallOutcome;
  temperature: Temperature | null;
  notes: string;
  next_call_at: IsoDate | null;
  handed_over: boolean;
  created_at: IsoDate;
}

export type VisitStatus = 'scheduled' | 'on_the_way' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
export type InterestLevel = 'high' | 'medium' | 'low';
export type VisitOutcome = 'booked' | 'negotiating' | 'interested' | 'not_interested';
export interface SiteVisit {
  id: Uuid;
  organization_id: Uuid;
  lead_id: Uuid;
  customer_id: Uuid;
  user_id: Uuid;
  user_name?: string;
  scheduled_at: IsoDate;
  location: string;
  status: VisitStatus;
  outcome: VisitOutcome | null;
  notes: string;
  completed_at: IsoDate | null;
  assigned_by: Uuid | null;
  assigned_by_name?: string | null;
  manager_notes: string;
  started_at: IsoDate | null;
  checked_in_at: IsoDate | null;
  interest_level: InterestLevel | null;
  feedback: string;
  next_step: string;
  follow_up_at: IsoDate | null;
  reschedule_reason: string | null;
}

export interface ExecPerformance {
  user_id: Uuid;
  full_name: string;
  role: Role;
  // marketing
  assigned: number;
  not_called: number;
  stale: number;            // assigned > 24h ago and never called
  overdue_callbacks: number;
  calls: number;
  calls_today: number;
  answered_rate: number;
  hot: number;
  warm: number;
  cold: number;
  handed_over: number;
  last_call_at: IsoDate | null;
  // sales
  visits_assigned: number;
  visits_today: number;
  visits_done: number;
  no_shows: number;
  reports_pending: number;
  won: number;
  lost: number;
  negotiating: number;
}

export interface TeamMemberLoad {
  user_id: Uuid;
  full_name: string;
  role: Role;
  open_leads: number;
  hot: number;
  warm: number;
  cold: number;
  callbacks_due: number;
  visits_upcoming: number;
  visits_done: number;
  converted: number;
}

export type ConversationStatus = 'open' | 'pending_human' | 'assigned' | 'resolved' | 'closed';
export interface Conversation {
  id: Uuid;
  organization_id: Uuid;
  customer_id: Uuid;
  channel: ChannelCode;
  status: ConversationStatus;
  assigned_user_id: Uuid | null;
  assigned_user_name: string | null;
  ai_enabled: boolean;
  locked_by_user_id: Uuid | null;
  locked_by_name: string | null;
  subject: string | null;
  last_message_at: IsoDate;
  /** UI convenience fields (joined by the API for the inbox list). */
  customer_name?: string;
  last_message_preview?: string;
  simulated?: boolean;
}

export type SenderType = 'customer' | 'ai_agent' | 'staff' | 'system';
export interface Message {
  id: Uuid;
  conversation_id: Uuid;
  direction: 'inbound' | 'outbound';
  sender_type: SenderType;
  sender_user_id: Uuid | null;
  sender_name?: string | null;
  message_type: 'text' | 'image' | 'audio' | 'system';
  content: string;
  created_at: IsoDate;
}

export type ToolStatus = 'success' | 'denied' | 'failed' | 'skipped' | 'not_applicable';
export type Decision = 'respond' | 'tool' | 'escalate' | 'failed';
export interface AiAction {
  intent: string;
  tool_name: string | null;
  tool_status: ToolStatus;
  confidence_final: number;
  decision: Decision;
  escalation_reason: string | null;
  created_at: IsoDate;
}

export type FollowUpStatus = 'scheduled' | 'completed' | 'cancelled' | 'missed';
export interface FollowUp {
  id: Uuid;
  organization_id: Uuid;
  customer_id: Uuid;
  lead_id: Uuid | null;
  conversation_id: Uuid | null;
  scheduled_at: IsoDate;
  channel: ChannelCode;
  reason: string;
  status: FollowUpStatus;
  assigned_user_id: Uuid | null;
  created_actor_type: ActorType;
  completed_at?: IsoDate | null;
  notes?: string | null;
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export interface Task {
  id: Uuid;
  organization_id: Uuid;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  customer_id: Uuid | null;
  assigned_user_id: Uuid | null;
  due_at: IsoDate | null;
  created_actor_type: ActorType;
}

export type EscalationStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'cancelled';
export type EscalationReason =
  | 'low_confidence' | 'human_requested' | 'sensitive_complaint' | 'billing_requires_human'
  | 'tool_not_permitted' | 'repeated_failure' | 'identity_conflict' | 'policy_approval'
  | 'llm_unavailable' | 'model_output_invalid' | 'ungrounded_claim' | 'data_store_unavailable'
  | 'staff_requested';
export interface Escalation {
  id: Uuid;
  organization_id: Uuid;
  conversation_id: Uuid;
  customer_id: Uuid;
  reason_code: EscalationReason;
  reason_detail: string;
  priority: Priority;
  status: EscalationStatus;
  triggered_by: 'ai_agent' | 'customer' | 'staff' | 'policy';
  assigned_user_id: Uuid | null;
  sla_due_at: IsoDate;
  created_at: IsoDate;
  resolved_at: IsoDate | null;
  resolution_notes?: string | null;
}

export type KnowledgeSource = 'faq' | 'policy' | 'product' | 'pricing' | 'company' | 'support';
export interface KnowledgeDocument {
  id: Uuid;
  organization_id: Uuid;
  title: string;
  source_type: KnowledgeSource;
  body: string;
  status: 'draft' | 'published' | 'archived';
  version: number;
  chunk_count: number;
  updated_at: IsoDate;
}
export interface KnowledgeChunk { document_id: Uuid; title: string; content: string; similarity: number }

export interface Dashboard {
  leads_created: number;
  leads_converted: number;
  conversion_rate: number;
  interactions: number;
  messages_by_channel: Partial<Record<ChannelCode, number>>;
  median_first_response_seconds: number;
  ai_resolution_rate: number;
  escalation_rate: number;
  followups_completed: number;
  followups_missed: number;
  leads_by_status: Partial<Record<LeadStatus, number>>;
  ai_actions_by_tool: { tool_name: string; tool_status: ToolStatus; count: number }[];
  median_ai_latency_ms: number;
  /** Daily series for charts (UI addition; the API can return it or the UI can omit charts). */
  daily: { date: string; leads: number; escalations: number; inbound: number }[];
}
export interface AgentStats {
  user_id: Uuid;
  full_name: string;
  role: Role;
  calls: number;
  hot_leads: number;
  handed_over: number;
  visits_done: number;
  conversions: number;
  replies: number;
  escalations_resolved: number;
  median_takeover_seconds: number;
  followups_completed: number;
}

export type NotificationType =
  | 'new_lead' | 'followup_due' | 'high_priority_customer' | 'ai_escalation'
  | 'conversation_assigned' | 'task_assigned' | 'sla_warning';
export interface Notification {
  id: Uuid;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: 'lead' | 'follow_up' | 'escalation' | 'conversation' | 'task';
  entity_id: Uuid;
  read_at: IsoDate | null;
  created_at: IsoDate;
}

export interface WidgetSession { visitor_session_id: string; conversation_id: Uuid; customer_id: Uuid; organization_name: string }
