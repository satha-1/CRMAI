// Role → permission matrix. Five roles:
//   admin                – people only: adds staff, gives roles, sets who reports to which manager
//   marketing_manager    – assigns leads / calls to marketing executives, checks their calls, customer messages
//   marketing_executive  – calls leads, marks them hot / warm / cold, hands interested leads to sales
//   sales_manager        – assigns site visits (exec + time + site) for leads marketing handed over
//   sales_executive      – goes to assigned visits, updates status, writes the visit report
// The server is the source of truth; the UI uses this only to hide controls.
import type { Permission, Role, Team } from '@/api/types';

const BASE: Permission[] = ['customer.read', 'lead.read', 'followup.read', 'conversation.read', 'notification.read'];

const MATRIX: Record<Role, Permission[]> = {
  admin: ['user.manage', 'org.manage', 'notification.read'],
  marketing_manager: [...BASE, 'customer.write', 'lead.write', 'lead.delete', 'lead.assign.marketing', 'call.log', 'followup.write',
    'conversation.reply', 'conversation.takeover', 'escalation.read', 'escalation.assign',
    'knowledge.read', 'knowledge.write', 'knowledge.publish', 'analytics.read', 'team.performance', 'audit.read'],
  marketing_executive: [...BASE, 'customer.write', 'lead.write', 'call.log', 'followup.write'],
  sales_manager: [...BASE, 'lead.write', 'lead.assign.sales', 'visit.assign', 'visit.manage', 'analytics.read', 'team.performance', 'audit.read'],
  sales_executive: [...BASE, 'lead.write', 'visit.manage'],
};

export const permissionsFor = (role: Role): Permission[] => MATRIX[role] ?? [];

export const ROLES: Role[] = ['admin', 'marketing_manager', 'marketing_executive', 'sales_manager', 'sales_executive'];
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  marketing_manager: 'Marketing manager',
  marketing_executive: 'Marketing executive',
  sales_manager: 'Sales manager',
  sales_executive: 'Sales executive',
};
export const ROLE_HELP: Record<Role, string> = {
  admin: 'Adds staff, gives each person a role and sets which manager every executive reports to. No sales work.',
  marketing_manager: 'Assigns leads and calls to their marketing executives, checks call results and reads customer messages.',
  marketing_executive: 'Calls assigned leads, marks them hot / warm / cold and hands interested ones to sales.',
  sales_manager: 'Assigns site visits (executive, time and site) for leads marketing handed over, and checks visit reports.',
  sales_executive: 'Checks today\'s visits, goes to the site, updates the status and writes what happened.',
};
export const ROLE_TONE: Record<Role, 'blue' | 'teal' | 'purple' | 'amber' | 'green'> = {
  admin: 'blue', marketing_manager: 'purple', marketing_executive: 'teal', sales_manager: 'amber', sales_executive: 'green',
};

export const isManager = (r: Role | null | undefined) => r === 'marketing_manager' || r === 'sales_manager';
export const managerRole: Record<Team, Role> = { marketing: 'marketing_manager', sales: 'sales_manager' };
export const isExecutive = (r: Role | null | undefined) => r === 'marketing_executive' || r === 'sales_executive';
export const teamOf = (r: Role | null | undefined): Team | null =>
  r === 'marketing_manager' || r === 'marketing_executive' ? 'marketing' : r === 'sales_manager' || r === 'sales_executive' ? 'sales' : null;
export const executiveRole: Record<Team, Role> = { marketing: 'marketing_executive', sales: 'sales_executive' };
