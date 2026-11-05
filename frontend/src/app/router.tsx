import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Permission } from '@/api/types';
import { RequireAuth, RequirePermission } from '@/auth/RequireAuth';
import { Layout } from './Layout';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InboxPage } from '@/features/inbox/InboxPage';
import { EscalationsPage } from '@/features/escalations/EscalationsPage';
import { LeadsPage } from '@/features/leads/LeadsPage';
import { LeadDetailPage } from '@/features/leads/LeadDetailPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { CustomerProfilePage } from '@/features/customers/CustomerProfilePage';
import { FollowUpsPage } from '@/features/followups/FollowUpsPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { KnowledgePage } from '@/features/knowledge/KnowledgePage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { UsersPage } from '@/features/users/UsersPage';
import { SettingsPage } from '@/features/users/SettingsPage';
import { CallsPage } from '@/features/calls/CallsPage';
import { VisitsPage } from '@/features/visits/VisitsPage';
import { AssignPage } from '@/features/assign/AssignPage';
import { VisitAssignPage } from '@/features/assign/VisitAssignPage';
import { AssignCallsPage } from '@/features/assign/AssignCallsPage';
import { PerformancePage } from '@/features/performance/PerformancePage';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState } from '@/components/ui';

function AssignGate() {
  const { role } = useAuth();
  if (role === 'sales_manager') return <VisitAssignPage />;
  if (role === 'marketing_manager') return <AssignPage />;
  return <EmptyState title="Only managers assign work" />;
}
/** The admin only manages people, so their home is the Team page. */
function Home() {
  const { role } = useAuth();
  return role === 'admin' ? <Navigate to="/users" replace /> : <DashboardPage />;
}

const gate = (perm: Permission, el: ReactNode) => <RequirePermission perm={perm}>{el}</RequirePermission>;

// Routes follow docs/frontend/FRONTEND-ARCHITECTURE.md §2 (+ /signup and /settings for multi-company).
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    path: '/',
    element: <RequireAuth><Layout /></RequireAuth>,
    children: [
      { index: true, element: <Home /> },
      { path: 'assign', element: <AssignGate /> },
      { path: 'assign-calls', element: gate('lead.assign.marketing', <AssignCallsPage />) },
      { path: 'performance', element: gate('team.performance', <PerformancePage />) },
      { path: 'calls', element: gate('call.log', <CallsPage />) },
      { path: 'visits', element: gate('visit.manage', <VisitsPage />) },
      { path: 'inbox', element: gate('conversation.read', <InboxPage />) },
      { path: 'inbox/:id', element: gate('conversation.read', <InboxPage />) },
      { path: 'conversations/:id', element: gate('conversation.read', <InboxPage />) },
      { path: 'escalations', element: gate('escalation.read', <EscalationsPage />) },
      { path: 'leads', element: gate('lead.read', <LeadsPage />) },
      { path: 'leads/:id', element: gate('lead.read', <LeadDetailPage />) },
      { path: 'customers', element: gate('customer.read', <CustomersPage />) },
      { path: 'customers/:id', element: gate('customer.read', <CustomerProfilePage />) },
      { path: 'followups', element: gate('followup.read', <FollowUpsPage />) },
      { path: 'tasks', element: gate('task.read', <TasksPage />) },
      { path: 'knowledge', element: gate('knowledge.read', <KnowledgePage />) },
      { path: 'analytics', element: gate('analytics.read', <AnalyticsPage />) },
      { path: 'users', element: gate('user.manage', <UsersPage />) },
      { path: 'settings', element: gate('org.manage', <SettingsPage />) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
