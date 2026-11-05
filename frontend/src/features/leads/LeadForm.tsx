// LeadForm: create (pre-fills customer_id when opened from a profile) and edit.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateLead, useCustomers, useUpdateLead } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { Lead } from '@/api/types';
import { Field, Modal, useToast } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

export function LeadFormModal({ onClose, customerId, lead }: { onClose: () => void; customerId?: string; lead?: Lead }) {
  const { org } = useAuth();
  const { data: customers } = useCustomers();
  const create = useCreateLead();
  const update = useUpdateLead();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({
    customer_id: lead?.customer_id ?? customerId ?? '',
    title: lead?.title ?? '',
    product_name: lead?.product_name ?? '',
    interest_summary: lead?.interest_summary ?? '',
    estimated_value: lead?.estimated_value?.toString() ?? '',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const busy = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const body = {
      title: f.title.trim(), product_name: f.product_name.trim() || null, interest_summary: f.interest_summary.trim(),
      estimated_value: f.estimated_value === '' ? null : Number(f.estimated_value),
    };
    if (lead) {
      update.mutate({ id: lead.id, ...body }, { onSuccess: () => { toast('Lead updated'); onClose(); }, onError: (x) => setErr(errorMessage(x)) });
    } else {
      create.mutate({ ...body, customer_id: f.customer_id, source_channel: 'website' }, {
        onSuccess: (l) => { toast('Lead created'); onClose(); nav(`/leads/${l.id}`); },
        onError: (x) => setErr(errorMessage(x)),
      });
    }
  };

  return (
    <Modal title={lead ? 'Edit lead' : 'New lead'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        {!lead && (
          <Field label="Customer" className="full">
            <select className="select" value={f.customer_id} onChange={set('customer_id')} required disabled={!!customerId}>
              <option value="">Choose a customer…</option>
              {customers?.items.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Title" className="full"><input className="input" value={f.title} onChange={set('title')} required minLength={3} maxLength={120} /></Field>
        <Field label={`${org?.product_label ? org.product_label[0].toUpperCase() + org.product_label.slice(1) : 'Product'} name`}><input className="input" value={f.product_name} onChange={set('product_name')} /></Field>
        <Field label="Estimated value" hint="Set by staff only — the AI never sets value"><input className="input" type="number" min={0} value={f.estimated_value} onChange={set('estimated_value')} /></Field>
        <Field label="Interest summary" className="full"><textarea className="textarea" value={f.interest_summary} onChange={set('interest_summary')} required /></Field>
        {err && <div className="error-text full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : lead ? 'Save' : 'Create lead'}</button>
        </div>
      </form>
    </Modal>
  );
}
