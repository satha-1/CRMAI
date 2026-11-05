// Workspace (company) settings for multi-company mode: profile, channels, website widget embed.
import { useEffect, useState } from 'react';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { useOrganization, useRotateWidgetKey, useUpdateOrganization } from '@/api/queries';
import { errorMessage } from '@/api/client';
import type { ChannelCode } from '@/api/types';
import { Badge, Card, Field, Loading, PageHeader, useToast } from '@/components/ui';
import { channelName, dateShort, humanize } from '@/lib/format';
import { OrgMark } from '@/components/WorkspaceSwitcher';

const CHANNEL_NOTE: Record<ChannelCode, string> = {
  website: 'Chat widget on your site',
  email: 'Inbound webhook + SMTP replies',
  whatsapp: 'Needs Meta credentials (future)',
  facebook: 'Needs Meta credentials (future)',
  instagram: 'Needs Meta credentials (future)',
  voice: 'Needs a voice provider (future)',
};
const LIVE: ChannelCode[] = ['website', 'email'];

export function SettingsPage() {
  const { data: org, isLoading } = useOrganization();
  const update = useUpdateOrganization();
  const rotate = useRotateWidgetKey();
  const toast = useToast();
  const [f, setF] = useState({ name: '', industry: '', timezone: '', product_label: '' });
  useEffect(() => { if (org) setF({ name: org.name, industry: org.industry, timezone: org.timezone, product_label: org.product_label }); }, [org]);
  if (isLoading || !org) return <div className="content"><Card><Loading /></Card></div>;

  const snippet = `<iframe src="${location.origin}/widget.html?key=${org.widget_key}"\n  title="Chat with ${org.name}" style="border:0;width:420px;height:680px"></iframe>`;
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Copied'));
  const save = (b: Parameters<typeof update.mutate>[0], ok = 'Saved') => update.mutate(b, { onSuccess: () => toast(ok), onError: (e) => toast(errorMessage(e), true) });

  return (
    <div className="content">
      <PageHeader title={<span className="row" style={{ gap: 12 }}><OrgMark id={org.id} name={org.name} />Workspace settings</span>}
        sub={<>Plan <Badge tone="purple">{humanize(org.plan)}</Badge> · created {dateShort(org.created_at)}</>} />
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <Card title="Company profile">
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(f); }}>
            <Field label="Company name" className="full"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
            <Field label="Industry"><input className="input" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} /></Field>
            <Field label="Timezone"><input className="input" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
            <Field label="What do you sell?" className="full" hint="The AI and UI use this word, e.g. package, property, course, plan">
              <input className="input" value={f.product_label} onChange={(e) => setF({ ...f, product_label: e.target.value })} />
            </Field>
            <div className="full row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={update.isPending}>Save</button></div>
          </form>
        </Card>
        <Card title="Channels">
          <div className="stack-sm">
            {org.channels.map((c) => (
              <div key={c.code} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div><div className="strong">{channelName[c.code]}</div><div className="muted small">{CHANNEL_NOTE[c.code]}</div></div>
                <label className="row small" style={{ cursor: LIVE.includes(c.code) ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={c.is_enabled} disabled={!LIVE.includes(c.code)}
                    onChange={(e) => save({ channels: org.channels.map((x) => (x.code === c.code ? { ...x, is_enabled: e.target.checked } : x)) }, `${channelName[c.code]} ${e.target.checked ? 'enabled' : 'disabled'}`)} />
                  {c.is_enabled ? 'Enabled' : 'Off'}
                </label>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>We never claim a channel is connected without a real transport.</p>
        </Card>
      </div>
      <Card title="Website chat widget">
        <div className="stack">
          <p className="muted">Each company gets its own public widget key. It only identifies the widget and is rate limited — it is not a secret.</p>
          <div className="row wrap">
            <span className="chip-key">{org.widget_key}</span>
            <button className="btn btn-sm" onClick={() => copy(org.widget_key)}><Copy /> Copy</button>
            <button className="btn btn-sm" onClick={() => confirm('Rotate the key? Sites using the old key stop working.') && rotate.mutate(undefined, { onSuccess: () => toast('Key rotated') })}><RefreshCw /> Rotate</button>
            <a className="btn btn-sm btn-outline-primary" href={`/widget.html?key=${org.widget_key}`} target="_blank" rel="noreferrer"><ExternalLink /> Try the widget</a>
          </div>
          <Field label="Embed snippet"><div className="code">{snippet}</div></Field>
          <div><button className="btn btn-sm" onClick={() => copy(snippet)}><Copy /> Copy snippet</button></div>
        </div>
      </Card>
    </div>
  );
}
