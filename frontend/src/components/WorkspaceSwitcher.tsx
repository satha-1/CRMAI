// Multi-company switcher (mockup: "Workspace · Northstar Realty").
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/api/client';
import { hashIndex, humanize, initials } from '@/lib/format';
import { Field, Modal, usePopover, useToast } from './ui';

const ORG_COLORS = ['#1d5bff', '#14a38b', '#7c4dff', '#e69a1c', '#dc3b3b', '#0369a1'];
export const orgColor = (id: string) => ORG_COLORS[hashIndex(id, ORG_COLORS.length)];

export function OrgMark({ id, name }: { id: string; name: string }) {
  return <span className="org-mark" style={{ background: orgColor(id) }}>{initials(name)}</span>;
}

export function WorkspaceSwitcher() {
  const { me, org, switchOrg } = useAuth();
  const { open, setOpen, ref } = usePopover();
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  if (!me || !org) return null;
  return (
    <div>
      <div className="ws-label">Workspace</div>
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="ws-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
          <Building2 size={18} className="muted" />
          <span className="grow ellipsis">{org.name}</span>
          <ChevronDown size={16} className="muted" />
        </button>
        {open && (
          <div className="popover ws-menu" role="menu">
            {me.memberships.map(({ organization: o, role }) => (
              <button key={o.id} role="menuitem" className={`ws-item ${o.id === org.id ? 'current' : ''}`}
                onClick={() => { switchOrg(o.id); setOpen(false); qc.removeQueries(); nav('/'); }}>
                <OrgMark id={o.id} name={o.name} />
                <span className="grow">
                  <span className="strong ellipsis" style={{ display: 'block' }}>{o.name}</span>
                  <span className="muted small">{humanize(role)} · {o.industry}</span>
                </span>
                {o.id === org.id && <Check size={16} color="var(--primary)" />}
              </button>
            ))}
            <div className="divider" />
            <button className="ws-item" role="menuitem" onClick={() => { setOpen(false); setCreating(true); }}>
              <span className="org-mark" style={{ background: 'var(--gray-50)', color: 'var(--text-2)' }}><Plus size={16} /></span>
              <span className="strong">Create a new workspace</span>
            </button>
          </div>
        )}
      </div>
      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} />}
    </div>
  );
}

const INDUSTRIES = ['Subscription services', 'Real estate', 'Retail', 'Education', 'Healthcare', 'Hospitality', 'Financial services', 'Other'];

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const { createOrg } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const o = await createOrg(name, industry);
      qc.removeQueries();
      toast(`Workspace “${o.name}” created`);
      onClose();
      nav('/settings');
    } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Create a workspace" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">Each company gets its own customers, AI knowledge base, channels and team. You'll be its admin.</p>
        <Field label="Company name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus /></Field>
        <Field label="Industry">
          <select className="select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        {err && <div className="error-text">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
        </div>
      </form>
    </Modal>
  );
}
