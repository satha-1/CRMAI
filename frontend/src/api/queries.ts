// TanStack Query hooks, one per API resource. Pages import from here instead of calling `api` directly,
// so cache keys and invalidation live in one place.
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, qs } from './client';
import type {
  ExecPerformance,
  AgentStats, AiAction, CallLog, SiteVisit, Team, TeamMemberLoad, Conversation, Customer, CustomerContact, Dashboard, Escalation, FollowUp,
  KnowledgeChunk, KnowledgeDocument, Lead, Message, Notification, Organization, Page, Task, TimelineItem, User,
} from './types';
import { useAuth } from '@/auth/AuthProvider';

/** All keys start with the organization id so switching workspace never shows another company's cache. */
function useKey(...parts: unknown[]): QueryKey {
  const { org } = useAuth();
  return [org?.id ?? 'none', ...parts];
}
function useInvalidate() {
  const qc = useQueryClient();
  const { org } = useAuth();
  return (...roots: string[]) => roots.forEach((r) => qc.invalidateQueries({ queryKey: [org?.id ?? 'none', r] }));
}
/** Mutation helper: run fn, then invalidate the listed resource roots. */
function useAction<TVars, TRes>(fn: (v: TVars) => Promise<TRes>, invalidates: string[]) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(...invalidates) });
}

// Polling fallback for real-time (FRONTEND-ARCHITECTURE §7: poll every 20s if the socket fails).
// In mock mode we poll faster so widget messages from another tab appear quickly.
const LIVE = 4000;

// ---------- organization ----------
export const useOrganization = () => useQuery({ queryKey: useKey('org'), queryFn: () => api.get<Organization>('/organizations/current') });
export const useUpdateOrganization = () => {
  const { reloadMe } = useAuth();
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (b: Partial<Organization>) => api.patch<Organization>('/organizations/current', b),
    onSuccess: () => { inv('org'); reloadMe(); },
  });
};
export const useRotateWidgetKey = () => useAction(() => api.post<Organization>('/organizations/current/rotate-widget-key'), ['org']);

// ---------- users ----------
export const useUsers = () => useQuery({ queryKey: useKey('users'), queryFn: () => api.get<Page<User>>('/users'), staleTime: 60_000 });
export const useCreateUser = () => useAction((b: { email: string; full_name: string; password?: string; role: string; manager_id?: string | null }) => api.post<User>('/users', b), ['users']);
export const useUpdateUser = () => useAction(({ id, ...b }: { id: string } & Partial<User>) => api.patch<User>(`/users/${id}`, b), ['users']);

// ---------- customers ----------
export const useCustomers = (params: { q?: string; status?: string } = {}) =>
  useQuery({ queryKey: useKey('customers', params), queryFn: () => api.get<Page<Customer>>(`/customers${qs(params)}`) });
export const useCustomer = (id?: string) =>
  useQuery({ queryKey: useKey('customers', id), queryFn: () => api.get<Customer>(`/customers/${id}`), enabled: !!id });
export const useCustomerContacts = (id?: string) =>
  useQuery({ queryKey: useKey('customers', id, 'contacts'), queryFn: () => api.get<Page<CustomerContact>>(`/customers/${id}/contacts`), enabled: !!id });
export const useTimeline = (id?: string) =>
  useQuery({ queryKey: useKey('timeline', id), queryFn: () => api.get<Page<TimelineItem>>(`/customers/${id}/timeline`), enabled: !!id, refetchInterval: LIVE * 2 });
export const useCreateCustomer = () => useAction((b: Partial<Customer>) => api.post<Customer>('/customers', b), ['customers']);
export const useUpdateCustomer = () => useAction(({ id, ...b }: { id: string } & Partial<Customer>) => api.patch<Customer>(`/customers/${id}`, b), ['customers', 'timeline']);

// ---------- leads ----------
export const useLeads = (params: { status?: string; assignee?: string; customer_id?: string } = {}) =>
  useQuery({ queryKey: useKey('leads', params), queryFn: () => api.get<Page<Lead>>(`/leads${qs(params)}`) });
export const useLead = (id?: string) => useQuery({ queryKey: useKey('leads', id), queryFn: () => api.get<Lead>(`/leads/${id}`), enabled: !!id });
export const useCreateLead = () => useAction((b: Partial<Lead>) => api.post<Lead>('/leads', b), ['leads', 'timeline', 'dashboard']);
export const useUpdateLead = () => useAction(({ id, ...b }: { id: string } & Partial<Lead>) => api.patch<Lead>(`/leads/${id}`, b), ['leads', 'timeline', 'dashboard', 'notifications']);
export const useDeleteLead = () => useAction((id: string) => api.del<void>(`/leads/${id}`), ['leads']);

// ---------- conversations ----------
export const useConversations = (params: { status?: string; channel?: string; assigned?: string; customer_id?: string } = {}) =>
  useQuery({ queryKey: useKey('conversations', params), queryFn: () => api.get<Page<Conversation>>(`/conversations${qs(params)}`), refetchInterval: LIVE });
export const useConversation = (id?: string) =>
  useQuery({ queryKey: useKey('conversations', id), queryFn: () => api.get<Conversation>(`/conversations/${id}`), enabled: !!id, refetchInterval: LIVE });
export const useMessages = (id?: string) =>
  useQuery({ queryKey: useKey('messages', id), queryFn: () => api.get<Page<Message>>(`/conversations/${id}/messages`), enabled: !!id, refetchInterval: LIVE });
export const useAiActions = (id?: string) =>
  useQuery({ queryKey: useKey('ai-actions', id), queryFn: () => api.get<Page<AiAction>>(`/conversations/${id}/ai-actions`), enabled: !!id, refetchInterval: LIVE });
export const useSendMessage = () => useAction((b: { conversation_id: string; content: string }) => api.post<Message>('/messages', b), ['messages', 'conversations']);
export const useTakeover = () => useAction((id: string) => api.post<Conversation>(`/conversations/${id}/takeover`), ['conversations', 'escalations']);
export const useRelease = () => useAction((id: string) => api.post<Conversation>(`/conversations/${id}/release`), ['conversations', 'escalations']);

// ---------- follow-ups ----------
export const useFollowUps = (params: { status?: string; assignee?: string; customer_id?: string; due_before?: string } = {}) =>
  useQuery({ queryKey: useKey('followups', params), queryFn: () => api.get<Page<FollowUp>>(`/followups${qs(params)}`) });
export const useCreateFollowUp = () => useAction((b: Partial<FollowUp>) => api.post<FollowUp>('/followups', b), ['followups', 'timeline']);
export const useCompleteFollowUp = () => useAction(({ id, notes }: { id: string; notes?: string }) => api.post<FollowUp>(`/followups/${id}/complete`, { notes }), ['followups', 'timeline', 'dashboard']);
export const useCancelFollowUp = () => useAction((id: string) => api.post<FollowUp>(`/followups/${id}/cancel`), ['followups']);

// ---------- tasks ----------
export const useTasks = (params: { status?: string; assignee?: string } = {}) =>
  useQuery({ queryKey: useKey('tasks', params), queryFn: () => api.get<Page<Task>>(`/tasks${qs(params)}`) });
export const useCreateTask = () => useAction((b: Partial<Task>) => api.post<Task>('/tasks', b), ['tasks']);
export const useUpdateTask = () => useAction(({ id, ...b }: { id: string } & Partial<Task>) => api.patch<Task>(`/tasks/${id}`, b), ['tasks']);

// ---------- escalations ----------
export type EscalationRow = Escalation & { customer_name: string; assigned_user_name: string | null };
export const useEscalations = (params: { status?: string; priority?: string; assignee?: string } = {}, enabled = true) =>
  useQuery({ queryKey: useKey('escalations', params), queryFn: () => api.get<Page<EscalationRow>>(`/escalations${qs(params)}`), refetchInterval: LIVE, enabled });
export const useCreateEscalation = () => useAction((b: { conversation_id: string; reason_detail: string; priority: string }) => api.post<Escalation>('/escalations', { ...b, reason_code: 'staff_requested' }), ['escalations', 'conversations', 'timeline']);
export const useAssignEscalation = () => useAction(({ id, user_id }: { id: string; user_id: string }) => api.post<Escalation>(`/escalations/${id}/assign`, { user_id }), ['escalations', 'conversations']);
export const useTakeoverEscalation = () => useAction((id: string) => api.post<Escalation>(`/escalations/${id}/takeover`), ['escalations', 'conversations']);
export const useResolveEscalation = () => useAction(({ id, resolution_notes }: { id: string; resolution_notes: string }) => api.post<Escalation>(`/escalations/${id}/resolve`, { resolution_notes }), ['escalations', 'conversations', 'timeline']);

// ---------- knowledge ----------
export const useKnowledge = (params: { status?: string } = {}) =>
  useQuery({ queryKey: useKey('knowledge', params), queryFn: () => api.get<Page<KnowledgeDocument>>(`/knowledge/documents${qs(params)}`) });
export const useCreateDocument = () => useAction((b: Partial<KnowledgeDocument>) => api.post<KnowledgeDocument>('/knowledge/documents', b), ['knowledge']);
export const useUpdateDocument = () => useAction(({ id, ...b }: { id: string } & Partial<KnowledgeDocument>) => api.patch<KnowledgeDocument>(`/knowledge/documents/${id}`, b), ['knowledge']);
export const usePublishDocument = () => useAction((id: string) => api.post(`/knowledge/documents/${id}/publish`), ['knowledge']);
export const useArchiveDocument = () => useAction((id: string) => api.post(`/knowledge/documents/${id}/archive`), ['knowledge']);
export const useKnowledgeSearch = () => useMutation({ mutationFn: (query: string) => api.post<{ chunks: KnowledgeChunk[] }>('/knowledge/search', { query }) });

// ---------- analytics ----------
export const useDashboard = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: useKey('dashboard', from, to), queryFn: () => api.get<Dashboard>(`/analytics/dashboard${qs({ from, to })}`), enabled });
export const useAgentStats = (from: string, to: string, enabled: boolean) =>
  useQuery({ queryKey: useKey('agent-stats', from, to), queryFn: () => api.get<Page<AgentStats>>(`/analytics/agents${qs({ from, to })}`), enabled });

// ---------- notifications ----------
export const useNotifications = () =>
  useQuery({ queryKey: useKey('notifications'), queryFn: () => api.get<Page<Notification>>('/notifications'), refetchInterval: LIVE * 2 });
export const useMarkRead = () => useAction((id: string) => api.post<void>(`/notifications/${id}/read`), ['notifications']);
export const useMarkAllRead = () => useAction(() => api.post<void>('/notifications/read-all'), ['notifications']);

// ---------- marketing calls & sales site visits ----------
export const useLeadsFor = (params: { status?: string; temperature?: string; unassigned?: Team; team?: Team } = {}) =>
  useQuery({ queryKey: useKey('leads', 'filtered', params), queryFn: () => api.get<Page<Lead>>(`/leads${qs(params)}`) });
export const useAssignLeads = () =>
  useAction((b: { team: Team; user_id: string; lead_ids: string[]; call_by?: string | null }) => api.post<{ assigned: number }>('/leads/assign', b), ['leads', 'workload', 'notifications', 'timeline']);
export const useAssignCalls = () =>
  useAction((b: { lead_ids: string[]; user_id: string; call_at: string; instruction?: string }) => api.post<{ assigned: number }>('/leads/assign-calls', b), ['leads', 'workload', 'performance', 'notifications']);
export const useWorkload = (team: Team, enabled = true) =>
  useQuery({ queryKey: useKey('workload', team), queryFn: () => api.get<Page<TeamMemberLoad>>(`/team/workload${qs({ team })}`), enabled });

export const useCalls = (mine?: boolean) =>
  useQuery({ queryKey: useKey('calls', mine), queryFn: () => api.get<Page<CallLog>>(`/calls${qs({ mine })}`) });
export const useLeadCalls = (leadId?: string) =>
  useQuery({ queryKey: useKey('calls', 'lead', leadId), queryFn: () => api.get<Page<CallLog>>(`/leads/${leadId}/calls`), enabled: !!leadId });
export const useLogCall = () =>
  useAction(({ lead_id, ...b }: { lead_id: string; outcome: string; temperature?: string | null; notes?: string; next_call_at?: string | null; hand_over?: boolean }) =>
    api.post<CallLog>(`/leads/${lead_id}/calls`, b), ['calls', 'leads', 'timeline', 'workload', 'dashboard']);

export const useVisits = (params: { mine?: boolean; lead_id?: string } = {}, enabled = true) =>
  useQuery({ queryKey: useKey('visits', params), queryFn: () => api.get<Page<SiteVisit>>(`/visits${qs(params)}`), enabled });
export const useLeadVisits = (leadId?: string) =>
  useQuery({ queryKey: useKey('visits', 'lead', leadId), queryFn: () => api.get<Page<SiteVisit>>(`/leads/${leadId}/visits`), enabled: !!leadId });
const VISIT_ROOTS = ['visits', 'leads', 'timeline', 'workload', 'performance', 'notifications', 'followups', 'dashboard'];
/** Sales manager assigns a visit: executive + time + site. */
export const useScheduleVisit = () =>
  useAction((b: { lead_id: string; user_id: string; scheduled_at: string; location: string; manager_notes?: string }) => api.post<SiteVisit>('/visits', b), VISIT_ROOTS);
export const useUpdateVisit = () =>
  useAction(({ id, ...b }: { id: string; user_id?: string; scheduled_at?: string; location?: string; manager_notes?: string }) => api.patch<SiteVisit>(`/visits/${id}`, b), VISIT_ROOTS);
export const useStartVisit = () => useAction((id: string) => api.post<SiteVisit>(`/visits/${id}/start`), VISIT_ROOTS);
export const useCheckinVisit = () => useAction((id: string) => api.post<SiteVisit>(`/visits/${id}/checkin`), VISIT_ROOTS);
export const useCompleteVisit = () =>
  useAction(({ id, ...b }: { id: string; outcome: string; interest_level: string; feedback: string; next_step?: string; follow_up_at?: string | null; notes?: string }) =>
    api.post<SiteVisit>(`/visits/${id}/complete`, b), VISIT_ROOTS);
export const useRescheduleRequest = () =>
  useAction(({ id, reason }: { id: string; reason: string }) => api.post<SiteVisit>(`/visits/${id}/reschedule-request`, { reason }), VISIT_ROOTS);
export const useCancelVisit = () =>
  useAction(({ id, ...b }: { id: string; no_show?: boolean; notes?: string }) => api.post<SiteVisit>(`/visits/${id}/cancel`, b), VISIT_ROOTS);
export const usePerformance = (enabled = true) =>
  useQuery({ queryKey: useKey('performance'), queryFn: () => api.get<Page<ExecPerformance>>('/team/performance'), enabled });
