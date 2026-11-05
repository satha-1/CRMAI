// Admin: Team & roles (user.manage). The admin's only job in the CRM:
//   add staff, give each person one of the 4 working roles, set which manager every executive reports to,
//   deactivate people who leave. Managers only see / assign executives who report to them.
import { useState } from 'react';
import { AlertTriangle, UserPlus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCreateUser, useUpdateUser, useUsers } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Role, Team, User } from '@/api/types';
import { Avatar, Badge, Card, Field, Loading, Modal, PageHeader, useToast } from '@/components/ui';
import { RoleBadge } from '@/components/leadBits';
import { ROLES, ROLE_HELP, ROLE_LABEL, managerRole, teamOf } from '@/auth/permissions';

const WORK_ROLES: Role[] = ROLES.filter((r) => r !== 'admin');
const isExec = (r: Role) => r === 'marketing_executive' || r === 'sales_executive';

export function UsersPage() {
  const { me, org } = useAuth();
  const { data, isLoading } = useUsers();
  const update = useUpdateUser();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const users = data?.items ?? [];
  const managersOf = (team: Team) => users.filter((u) => u.role === managerRole[team] && u.is_active);
  const patch = (u: User, b: Partial<User>, msg = 'Saved') =>
    update.mutate({ id: u.id, ...b }, { onSuccess: () => toast(msg), onError: (e) => toast(errorMessage(e), true) });
  const noManager = users.filter((u) => u.is_active && isExec(u.role) && !u.manager_id);

  return (
    <div className="content">
      <PageHeader title="Team & roles" sub={`Who works at ${org?.name}, what role they have, and who they report to.`}
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus /> Add staff</button>} />

      {noManager.length > 0 && (
        <div className="alert alert-warn"><AlertTriangle /><div><b>{noManager.length} executive{noManager.length > 1 ? 's have' : ' has'} no manager:</b> {noManager.map((u) => u.full_name).join(', ')}. Every manager of that team can assign work to them until you pick one.</div></div>
      )}

      <div className="grid g-2">
        {(['marketing', 'sales'] as Team[]).map((team) => <TeamTree key={team} team={team} users={users} />)}
      </div>

      <Card pad={false} title={<h2>All staff</h2>}>
        {isLoading ? <Loading /> : (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Reports to</th><th>Status</th><th /></tr></thead>
              <tbody>
                {users.map((u) => {
                  const team = teamOf(u.role);
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} style={u.is_active ? undefined : { opacity: 0.55 }}>
                      <td><div className="row"><Avatar name={u.full_name} /><span className="strong">{u.full_name}</span>{self && <Badge tone="blue">You</Badge>}</div></td>
                      <td>{u.email}</td>
                      <td>
                        {self || u.role === 'admin' ? <RoleBadge r={u.role} /> : (
                          <select className="select" style={{ height: 32, width: 190 }} value={u.role} aria-label={`Role for ${u.full_name}`}
                            onChange={(e) => patch(u, { role: e.target.value as Role }, `${u.full_name} is now ${ROLE_LABEL[e.target.value as Role]}`)}>
                            {WORK_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        )}
                      </td>
                      <td>
                        {isExec(u.role) && team ? (
                          <select className="select" style={{ height: 32, width: 190 }} value={u.manager_id ?? ''} aria-label={`Manager for ${u.full_name}`}
                            onChange={(e) => patch(u, { manager_id: e.target.value || null }, 'Reporting line saved')}>
                            <option value="">— No manager —</option>
                            {managersOf(team).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                          </select>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>{u.is_active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Deactivated</Badge>}</td>
                      <td style={{ textAlign: 'right' }}>
                        {!self && <button className="btn btn-sm" onClick={() => patch(u, { is_active: !u.is_active }, u.is_active ? 'Deactivated' : 'Reactivated')}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid g-4">
        {WORK_ROLES.map((r) => (
          <div key={r} className="card card-pad"><RoleBadge r={r} /><p className="muted small" style={{ marginTop: 8 }}>{ROLE_HELP[r]}</p></div>
        ))}
      </div>
      {adding && <AddUserModal users={users} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Marketing / sales team as manager → executives. */
function TeamTree({ team, users }: { team: Team; users: User[] }) {
  const active = users.filter((u) => u.is_active);
  const managers = active.filter((u) => u.role === managerRole[team]);
  const execs = active.filter((u) => u.role === (team === 'marketing' ? 'marketing_executive' : 'sales_executive'));
  const orphans = execs.filter((e) => !e.manager_id || !managers.some((m) => m.id === e.manager_id));
  return (
    <Card title={<h2>{team === 'marketing' ? 'Marketing team' : 'Sales team'}</h2>} actions={<span className="muted small">{managers.length} manager{managers.length === 1 ? '' : 's'} · {execs.length} executive{execs.length === 1 ? '' : 's'}</span>}>
      {!managers.length && <p className="muted">No {team} manager yet. Give someone the {ROLE_LABEL[managerRole[team]]} role.</p>}
      <div className="stack">
        {managers.map((m) => {
          const mine = execs.filter((e) => e.manager_id === m.id);
          return (
            <div key={m.id} className="tree">
              <div className="row"><Avatar name={m.full_name} /><div><div className="strong">{m.full_name}</div><div className="muted small">{ROLE_LABEL[m.role]}</div></div></div>
              <ul>{mine.length ? mine.map((e) => <li key={e.id} className="row"><Avatar name={e.full_name} size="sm" />{e.full_name}</li>) : <li className="muted small">No executives yet</li>}</ul>
            </div>
          );
        })}
        {orphans.length > 0 && (
          <div className="tree"><div className="muted small">No manager</div><ul>{orphans.map((e) => <li key={e.id} className="row"><Avatar name={e.full_name} size="sm" />{e.full_name}</li>)}</ul></div>
        )}
      </div>
    </Card>
  );
}

function AddUserModal({ users, onClose }: { users: User[]; onClose: () => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'marketing_executive' as Role, manager_id: '' });
  const [err, setErr] = useState('');
  const team = teamOf(f.role);
  const managers = team ? users.filter((u) => u.is_active && u.role === managerRole[team]) : [];
  return (
    <Modal title="Add staff member" onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ ...f, manager_id: isExec(f.role) ? f.manager_id || null : null }, { onSuccess: () => { toast('Staff member added'); onClose(); }, onError: (x) => setErr(errorMessage(x)) });
      }}>
        <Field label="Full name" className="full"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></Field>
        <Field label="Email" className="full" hint="If they already use CRMAI for another company, they get access to this workspace too."><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Temporary password" hint="At least 10 characters"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={10} /></Field>
        <Field label="Role">
          <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role, manager_id: '' })}>{WORK_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </Field>
        {isExec(f.role) && (
          <Field label="Reports to" className="full">
            <select className="select" value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
              <option value="">— No manager yet —</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </Field>
        )}
        <p className="muted small full">{ROLE_HELP[f.role]}</p>
        {err && <div className="error-text full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={create.isPending}>Add</button>
        </div>
      </form>
    </Modal>
  );
}
