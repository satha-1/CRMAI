// Dependency-free SVG charts matching the mockups (sparklines in KPI cards, area line chart, bar rows).
import { useId, useState } from 'react';

export function Sparkline({ data, color = '#1d5bff', height = 46 }: { data: number[]; color?: string; height?: number }) {
  const id = useId();
  if (data.length < 2) return <div style={{ height }} />;
  const w = 240;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 4 - ((v - min) / (max - min || 1)) * (height - 10)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

interface Series { name: string; values: number[]; color: string; dashed?: boolean; area?: boolean }
export function LineChart({ labels, series, height = 240, format = (v: number) => String(v) }: { labels: string[]; series: Series[]; height?: number; format?: (v: number) => string }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 48, R = 16, T = 14, B = 28;
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...all, 1));
  const n = labels.length;
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const step = Math.max(1, Math.ceil(n / 6));
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={series.map((s) => s.name).join(' and ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
        }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={series[0]?.color} stopOpacity=".22" />
            <stop offset="1" stopColor={series[0]?.color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e3e8f0" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % step === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">{l}</text>
        ))}
        {series.map((s, si) => {
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              {s.area && <path d={`${d} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={si === 0 ? `url(#${gid})` : s.color} opacity={si === 0 ? 1 : 0.08} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.4" strokeDasharray={s.dashed ? '6 5' : undefined} strokeLinejoin="round" />
              <circle cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r="4.5" fill="#fff" stroke={s.color} strokeWidth="2" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />
            {series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill={s.color} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="card" style={{ position: 'absolute', top: 6, left: `${Math.min(70, (x(hover) / W) * 100)}%`, padding: '8px 10px', fontSize: 12.5, pointerEvents: 'none', minWidth: 130 }}>
          <div className="strong">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="row" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
              <span className="muted">{s.name}</span><span className="strong" style={{ marginLeft: 'auto' }}>{format(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="row wrap" style={{ gap: 16, fontSize: 13 }}>
      {items.map((i) => (
        <span key={i.name} className="row" style={{ gap: 6 }}>
          {i.dashed
            ? <span style={{ width: 18, borderTop: `2px dashed ${i.color}` }} />
            : <span style={{ width: 9, height: 9, borderRadius: 5, background: i.color }} />}
          <span className="muted">{i.name}</span>
        </span>
      ))}
    </div>
  );
}

export function BarRows({ rows }: { rows: { label: string; value: number; max: number; color: string; display: string }[] }) {
  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="ellipsis">{r.label}</span>
          <div className="bar" role="img" aria-label={`${r.label}: ${r.display}`}>
            <span style={{ width: `${r.max ? Math.max(2, (r.value / r.max) * 100) : 0}%`, background: r.color }} />
          </div>
          <span className="val">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
