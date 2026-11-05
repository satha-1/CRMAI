// Small lead widgets shared by Calls, Visits, Assign, Pipeline and Lead detail.
import { Flame, Snowflake, Sun } from 'lucide-react';
import type { LeadStatus, Role, Temperature } from '@/api/types';
import { leadLabel, leadTone } from '@/lib/format';
import { ROLE_LABEL, ROLE_TONE } from '@/auth/permissions';
import { Badge } from './ui';

const ICON = { hot: Flame, warm: Sun, cold: Snowflake };
const TONE = { hot: 'red', warm: 'amber', cold: 'blue' } as const;

export function TempBadge({ t, empty = 'Not rated' }: { t: Temperature | null | undefined; empty?: string }) {
  if (!t) return <Badge tone="gray">{empty}</Badge>;
  const I = ICON[t];
  return <Badge tone={TONE[t]}><I size={12} />{t[0].toUpperCase() + t.slice(1)}</Badge>;
}

export function TempPicker({ value, onChange }: { value: Temperature | null; onChange: (t: Temperature) => void }) {
  return (
    <div className="temp-picker" role="radiogroup" aria-label="Lead temperature">
      {(['hot', 'warm', 'cold'] as Temperature[]).map((t) => {
        const I = ICON[t];
        return (
          <button key={t} type="button" role="radio" aria-checked={value === t} className={`temp-opt ${t} ${value === t ? 'on' : ''}`} onClick={() => onChange(t)}>
            <I size={18} />{t[0].toUpperCase() + t.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

export function StageBadge({ s }: { s: LeadStatus }) {
  return <Badge tone={leadTone[s]} dot>{leadLabel[s]}</Badge>;
}

export function RoleBadge({ r }: { r: Role }) {
  return <Badge tone={ROLE_TONE[r]}>{ROLE_LABEL[r]}</Badge>;
}
