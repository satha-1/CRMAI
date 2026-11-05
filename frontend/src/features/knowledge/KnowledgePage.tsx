// Mockup 05 "Automations" layout re-used for the AI knowledge base (docs/ai/RAG-ARCHITECTURE.md):
// list of documents + detail with the publish pipeline, editor (knowledge.write), publish/archive (knowledge.publish),
// and a retrieval tester so supervisors can see what the AI would find.
import { useEffect, useState } from 'react';
import { Archive, BookOpen, FileText, Layers, Plus, Rocket, Search, Sparkles } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useArchiveDocument, useCreateDocument, useKnowledge, useKnowledgeSearch, usePublishDocument, useUpdateDocument } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { KnowledgeDocument, KnowledgeSource } from '@/api/types';
import { Badge, Card, EmptyState, Field, Loading, Modal, PageHeader, useToast } from '@/components/ui';
import { dateShort, humanize, pct } from '@/lib/format';

const SOURCES: KnowledgeSource[] = ['faq', 'policy', 'product', 'pricing', 'company', 'support'];
const SOURCE_TONE: Record<KnowledgeSource, 'blue' | 'teal' | 'purple' | 'amber' | 'gray' | 'green'> = { faq: 'blue', policy: 'amber', product: 'purple', pricing: 'teal', company: 'gray', support: 'green' };
const statusTone = { draft: 'amber', published: 'green', archived: 'gray' } as const;

export function KnowledgePage() {
  const { has } = useAuth();
  const { data, isLoading } = useKnowledge();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const docs = data?.items ?? [];
  const current = docs.find((d) => d.id === selected) ?? docs[0];

  return (
    <div className="content">
      <PageHeader title="AI knowledge" sub="The only facts the AI agent may use to answer. Drafts are never retrieved — publish to make them live."
        actions={has('knowledge.write') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> New document</button>} />
      <div className="grid g-side-main" style={{ alignItems: 'start' }}>
        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Document</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {isLoading && <tr><td colSpan={3}><Loading rows={3} /></td></tr>}
                {docs.map((d) => (
                  <tr key={d.id} className={`clickable ${current?.id === d.id ? 'selected' : ''}`} onClick={() => setSelected(d.id)}>
                    <td>
                      <div className="row">
                        <span className="kpi-icon" style={{ width: 34, height: 34, background: `var(--${SOURCE_TONE[d.source_type] === 'blue' ? 'primary' : SOURCE_TONE[d.source_type]}-50)` }}><FileText size={17} /></span>
                        <div><div className="strong">{d.title}</div><div className="muted small">{humanize(d.source_type)} · v{d.version}</div></div>
                      </div>
                    </td>
                    <td><Badge tone={statusTone[d.status]} dot>{humanize(d.status)}</Badge></td>
                    <td className="nowrap small">{dateShort(d.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && !docs.length && <EmptyState icon={<BookOpen />} title="No knowledge yet" body="Add your FAQs, prices and policies so the AI can answer." />}
        </section>
        <div className="stack" style={{ gap: 18 }}>
          {current && <DocDetail key={current.id} d={current} />}
          <SearchTester />
        </div>
      </div>
      {creating && <NewDocModal onClose={() => setCreating(false)} onCreated={setSelected} />}
    </div>
  );
}

function DocDetail({ d }: { d: KnowledgeDocument }) {
  const { has } = useAuth();
  const toast = useToast();
  const update = useUpdateDocument();
  const publish = usePublishDocument();
  const archive = useArchiveDocument();
  const [title, setTitle] = useState(d.title);
  const [body, setBody] = useState(d.body);
  useEffect(() => { setTitle(d.title); setBody(d.body); }, [d.title, d.body]);
  const dirty = title !== d.title || body !== d.body;
  const canEdit = has('knowledge.write');
  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok)).catch((e) => toast(errorMessage(e), true));

  return (
    <section className="card card-pad stack" style={{ gap: 16 }}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm">
          <h2 style={{ fontSize: 24 }}>{d.title}</h2>
          <div className="row"><Badge tone={statusTone[d.status]} dot>{humanize(d.status)}</Badge><Badge tone={SOURCE_TONE[d.source_type]}>{humanize(d.source_type)}</Badge><span className="muted small">{d.chunk_count} chunks · version {d.version}</span></div>
        </div>
        <div className="row">
          {has('knowledge.publish') && d.status === 'published' && <button className="btn btn-sm" onClick={() => run(archive.mutateAsync(d.id), 'Archived — the AI can no longer retrieve it')}><Archive /> Archive</button>}
          {has('knowledge.publish') && d.status !== 'published' && <button className="btn btn-sm btn-primary" disabled={dirty} onClick={() => run(publish.mutateAsync(d.id), 'Published — chunks embedded')}><Rocket /> Publish</button>}
        </div>
      </div>

      <div className="flow" aria-label="How this document reaches the AI">
        <FlowStep icon={<FileText />} bg="var(--amber-50)" fg="#9a5c06" title="Draft" sub="Staff write or edit the text" on={true} />
        <div className="flow-arrow" />
        <FlowStep icon={<Layers />} bg="var(--teal-50)" fg="#0c7a66" title="Publish · chunk & embed" sub="Split into passages and stored with vectors" on={d.status === 'published'} />
        <div className="flow-arrow" />
        <FlowStep icon={<Sparkles />} bg="var(--purple-50)" fg="#5b30d6" title="Retrieved by the AI" sub="search_knowledge returns matching passages; replies must cite them" on={d.status === 'published'} />
      </div>

      {canEdit ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(update.mutateAsync({ id: d.id, title, body }), 'Saved as draft'); }}>
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
          <Field label="Content" hint={`${body.length.toLocaleString()} / 40,000 characters`}>
            <textarea className="textarea" style={{ minHeight: 160 }} value={body} onChange={(e) => setBody(e.target.value)} maxLength={40000} required />
          </Field>
          {d.status === 'published' && dirty && <div className="alert alert-warn">Saving creates a new draft. The published version keeps answering until you publish again.</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={!dirty || update.isPending}>Save draft</button></div>
        </form>
      ) : <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{d.body}</p>}
    </section>
  );
}

function FlowStep({ icon, bg, fg, title, sub, on }: { icon: React.ReactNode; bg: string; fg: string; title: string; sub: string; on: boolean }) {
  return (
    <div className="flow-step" style={{ opacity: on ? 1 : 0.5 }}>
      <span className="kpi-icon" style={{ background: bg, color: fg }}>{icon}</span>
      <div><div className="strong" style={{ fontSize: 16 }}>{title}</div><div className="muted small">{sub}</div></div>
    </div>
  );
}

function SearchTester() {
  const search = useKnowledgeSearch();
  const [q, setQ] = useState('');
  return (
    <Card title={<div className="row"><Search size={18} /><h2>Test retrieval</h2></div>}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); q.trim() && search.mutate(q); }}>
        <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. premium package price" aria-label="Test query" />
        <button className="btn btn-primary" disabled={search.isPending}>Search</button>
      </form>
      {search.data && (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          {!search.data.chunks.length && <div className="alert alert-warn">No published passage is similar enough — the AI would not answer this from knowledge and may escalate.</div>}
          {search.data.chunks.map((c, i) => (
            <div key={i} className="ai-row">
              <div className="row-between"><span className="strong">{c.title}</span><Badge tone={c.similarity > 0.8 ? 'green' : 'amber'}>{pct(c.similarity)} match</Badge></div>
              <span className="muted small">{c.content.slice(0, 220)}{c.content.length > 220 ? '…' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NewDocModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateDocument();
  const toast = useToast();
  const [f, setF] = useState({ title: '', source_type: 'faq' as KnowledgeSource, body: '' });
  const [err, setErr] = useState('');
  return (
    <Modal title="New knowledge document" onClose={onClose}>
      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        create.mutate(f, { onSuccess: (d) => { toast('Draft created'); onCreated(d.id); onClose(); }, onError: (x) => setErr(errorMessage(x)) });
      }}>
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
        <Field label="Type">
          <select className="select" value={f.source_type} onChange={(e) => setF({ ...f, source_type: e.target.value as KnowledgeSource })}>
            {SOURCES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        </Field>
        <Field label="Content"><textarea className="textarea" style={{ minHeight: 160 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required maxLength={40000} /></Field>
        {err && <div className="error-text">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={create.isPending}>Create draft</button>
        </div>
      </form>
    </Modal>
  );
}
