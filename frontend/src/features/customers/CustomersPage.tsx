// Mockup 03 "Contacts": searchable table with a side drawer (contact info, owner, linked lead, timeline).
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpDown, ExternalLink, Mail, Phone, Plus, Search } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCreateCustomer, useCustomers, useLeads, useTimeline, useUpdateCustomer, useUsers } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Customer, CustomerStatus } from '@/api/types';
import { Avatar, Badge, Card, Drawer, EmptyState, Field, Loading, Modal, PageHeader, useToast } from '@/components/ui';
import { Timeline } from '@/components/Timeline';
import { channelName, dateShort, humanize, leadTone, money } from '@/lib/format';

const statusTone: Record<CustomerStatus, 'green' | 'amber' | 'gray'> = { active: 'green', provisional: 'amber', inactive: 'gray' };
type SortKey = 'full_name' | 'company_name' | 'status' | 'updated_at';

export function CustomersPage() {
  const { has } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'updated_at', asc: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useCustomers({ q: q || undefined, status: status || undefined });
  const { data: users } = useUsers();
  const uname = useMemo(() => new Map(users?.items.map((u) => [u.id, u.full_name])), [users]);
  const rows = [...(data?.items ?? [])].sort((a, b) => {
    const x = String(a[sort.k] ?? ''); const y = String(b[sort.k] ?? '');
    return sort.asc ? x.localeCompare(y) : y.localeCompare(x);
  });
  const th = (k: SortKey, label: string) => (
    <th aria-sort={sort.k === k ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => setSort({ k, asc: sort.k === k ? !sort.asc : true })}>{label}<ArrowUpDown /></button>
    </th>
  );
  const current = rows.find((c) => c.id === selected);

  return (
    <div className="content">
      <PageHeader title="Customers" sub="Everyone who contacted you on any channel, including provisional website visitors."
        actions={has('customer.write') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> New customer</button>} />
      <div className="row wrap">
        <div className="search" style={{ width: 'min(360px, 100%)' }}>
          <Search /><input className="input" placeholder="Search name, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </div>
        <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option><option value="active">Active</option><option value="provisional">Provisional</option><option value="inactive">Inactive</option>
        </select>
      </div>
      <Card pad={false}>
        {isLoading ? <Loading /> : !rows.length ? <EmptyState title="No customers found" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{th('full_name', 'Name')}{th('company_name', 'Company')}{th('status', 'Status')}<th>Owner</th><th>Channel</th>{th('updated_at', 'Last activity')}</tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={`clickable ${c.id === selected ? 'selected' : ''}`} onClick={() => setSelected(c.id)}>
                    <td><div className="row"><Avatar name={c.full_name} /><span className="strong">{c.full_name}</span></div></td>
                    <td>{c.company_name ?? <span className="muted">—</span>}</td>
                    <td><Badge tone={statusTone[c.status]} dot>{humanize(c.status)}</Badge></td>
                    <td>{c.owner_user_id ? <div className="row"><Avatar name={uname.get(c.owner_user_id)} size="sm" />{uname.get(c.owner_user_id)}</div> : <span className="muted">—</span>}</td>
                    <td>{c.preferred_channel ? channelName[c.preferred_channel] : '—'}</td>
                    <td className="nowrap">{dateShort(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {current && <CustomerDrawer c={current} onClose={() => setSelected(null)} />}
      {creating && <CustomerFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CustomerDrawer({ c, onClose }: { c: Customer; onClose: () => void }) {
  const { has } = useAuth();
  const { data: users } = useUsers();
  const { data: leads } = useLeads({ customer_id: c.id });
  const { data: tl } = useTimeline(c.id);
  const update = useUpdateCustomer();
  const toast = useToast();
  return (
    <Drawer onClose={onClose} label={c.full_name}>
      <div className="row" style={{ gap: 14 }}>
        <Avatar name={c.full_name} size="lg" />
        <div><h2 style={{ fontSize: 22 }}>{c.full_name}</h2><div className="muted">{c.company_name ?? humanize(c.status)}</div></div>
      </div>
      <div className="row wrap" style={{ gap: 18 }}>
        {c.primary_email && <a href={`mailto:${c.primary_email}`} className="row" style={{ color: 'var(--text)' }}><Mail size={17} />{c.primary_email}</a>}
        {c.primary_phone && <span className="row"><Phone size={17} />{c.primary_phone}</span>}
      </div>
      <div className="divider" />
      <Field label="Customer owner">
        <select className="select" value={c.owner_user_id ?? ''} disabled={!has('customer.write')}
          onChange={(e) => update.mutate({ id: c.id, owner_user_id: e.target.value || null }, { onSuccess: () => toast('Owner updated'), onError: (x) => toast(errorMessage(x), true) })}>
          <option value="">Unassigned</option>
          {users?.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </Field>
      <div className="stack-sm">
        <span className="strong small">Linked leads</span>
        {!leads?.items.length && <span className="muted small">No leads yet.</span>}
        {leads?.items.map((l) => (
          <Link key={l.id} to={`/leads/${l.id}`} className="ai-row" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="row-between"><span className="strong" style={{ color: 'var(--primary)' }}>{l.title}</span><span className="row">{l.estimated_value ? <span className="money">{money(l.estimated_value)}</span> : null}<ExternalLink size={15} /></span></div>
            <span className="muted small">Lead · <Badge tone={leadTone[l.status]}>{l.status}</Badge> · Created {dateShort(l.created_at)}</span>
          </Link>
        ))}
      </div>
      <div className="divider" />
      <div className="row-between"><h2>Timeline</h2><Link to={`/customers/${c.id}`} className="small">Full profile →</Link></div>
      <Timeline items={tl?.items ?? []} compact />
    </Drawer>
  );
}

export function CustomerFormModal({ onClose, customer }: { onClose: () => void; customer?: Customer }) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({
    full_name: customer?.full_name ?? '', primary_email: customer?.primary_email ?? '', primary_phone: customer?.primary_phone ?? '',
    company_name: customer?.company_name ?? '', preferred_channel: customer?.preferred_channel ?? 'website', status: customer?.status ?? 'active', notes: customer?.notes ?? '',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...f, primary_email: f.primary_email || null, primary_phone: f.primary_phone || null, company_name: f.company_name || null } as Partial<Customer>;
    if (customer) update.mutate({ id: customer.id, ...body }, { onSuccess: () => { toast('Customer saved'); onClose(); }, onError: (x) => setErr(errorMessage(x)) });
    else create.mutate(body, { onSuccess: (c) => { toast('Customer created'); onClose(); nav(`/customers/${c.id}`); }, onError: (x) => setErr(errorMessage(x)) });
  };
  return (
    <Modal title={customer ? 'Edit customer' : 'New customer'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Full name" className="full"><input className="input" value={f.full_name} onChange={set('full_name')} required maxLength={160} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.primary_email} onChange={set('primary_email')} /></Field>
        <Field label="Phone"><input className="input" value={f.primary_phone} onChange={set('primary_phone')} /></Field>
        <Field label="Company"><input className="input" value={f.company_name} onChange={set('company_name')} /></Field>
        <Field label="Preferred channel">
          <select className="select" value={f.preferred_channel} onChange={set('preferred_channel')}>
            {Object.entries(channelName).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {customer && (
          <>
            <Field label="Status">
              <select className="select" value={f.status} onChange={set('status')}>
                <option value="active">Active</option><option value="provisional">Provisional</option><option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Internal notes" className="full" hint="Staff only. Not shown to the customer."><textarea className="textarea" value={f.notes} onChange={set('notes')} /></Field>
          </>
        )}
        {err && <div className="error-text full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={create.isPending || update.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
