import { useState } from 'react'

export const LV = {
  SAFE: { c: '#2E7D32', bg: '#E8F5E9', t: 'SAFE', i: '●' },
  CAUTION: { c: '#E65100', bg: '#FFF3E0', t: 'CAUTION', i: '▲' },
  HIGH: { c: '#BF360C', bg: '#FBE9E7', t: 'HIGH', i: '▲' },
  CRITICAL: { c: '#B71C1C', bg: '#FFEBEE', t: 'CRITICAL', i: '■' },
  UNKNOWN: { c: '#475569', bg: '#F1F5F9', t: 'LIMITED DATA', i: '?' },
}
export const STATUS_COLOR = { NORMAL: '#2E7D32', ATTENTION: '#E65100', CRITICAL: '#B71C1C', OFFLINE: '#94A3B8', DEGRADED: '#475569' }

/** Icon + text + colour (never colour alone). */
export function LevelChip({ level = 'UNKNOWN', big }) {
  const m = LV[level] || LV.UNKNOWN
  return (
    <span className={`inline-flex items-center gap-1 rounded font-semibold ${big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'}`} style={{ color: m.c, background: m.bg, border: `1px solid ${m.c}33` }}>
      <span aria-hidden>{m.i}</span>{m.t}
    </span>
  )
}

const SRC = {
  REAL: ['REAL', '#166534', '#DCFCE7'], SIMULATION: ['SIMULATION', '#6B21A8', '#F3E8FF'],
  ESTIMATED: ['ESTIMATED', '#075985', '#E0F2FE'], UNAVAILABLE: ['UNAVAILABLE', '#475569', '#E2E8F0'],
  PROJECTED: ['PROJECTED', '#075985', '#E0F2FE'], OBSERVED: ['OBSERVED', '#166534', '#DCFCE7'], MODELLED: ['MODELLED / SIMULATED', '#6B21A8', '#F3E8FF'],
  CONFIGURED: ['CONFIGURED', '#92400E', '#FEF3C7'],
}
/** Mandatory data-source badge: REAL | SIMULATION | ESTIMATED | UNAVAILABLE (+ OBSERVED/PROJECTED/MODELLED/CONFIGURED). */
export function Src({ s, title }) {
  const [t, c, bg] = SRC[s] || SRC.UNAVAILABLE
  return <span title={title} className="inline-block text-[9px] font-bold tracking-wider px-1.5 py-[1px] rounded" style={{ color: c, background: bg }}>{t}</span>
}

export function Note({ children, tone = 'neutral' }) {
  const cls = tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'
  return <div className={`mt-2 border rounded px-3 py-2 text-[11px] leading-relaxed ${cls}`}>{children}</div>
}

export function Card({ title, sub, right, children, className = '', accent = '#0A2540', pad = true }) {
  return (
    <section className={`bg-white border border-slate-200 rounded shadow-sm ${className}`} style={{ borderTop: `3px solid ${accent}` }}>
      {(title || right) && (
        <header className="px-4 py-2.5 border-b border-slate-200 flex items-start justify-between gap-2 flex-wrap">
          <div><h2 className="font-semibold text-sm text-slate-800">{title}</h2>{sub && <p className="text-[11px] text-slate-500">{sub}</p>}</div>
          <div className="flex items-center gap-1.5 flex-wrap">{right}</div>
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone }) {
  const col = tone === 'bad' ? '#B71C1C' : tone === 'warn' ? '#E65100' : tone === 'good' ? '#2E7D32' : '#0F172A'
  return (
    <div className="bg-white border border-slate-200 rounded px-3 py-2 shadow-sm min-w-[110px]">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="font-mono text-xl font-bold leading-tight" style={{ color: col }}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  )
}

/** A sensor value that NEVER invents data: null -> NOT CONNECTED / UNAVAILABLE. */
export function Val({ v, unit = '', digits = 1, source, missing = 'NOT CONNECTED' }) {
  if (v === null || v === undefined) return <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{missing}</span>
  return <span className="font-mono font-semibold">{typeof v === 'number' ? v.toFixed(digits) : v}{unit} {source && <Src s={source} />}</span>
}

export const ago = (s) => (s == null ? '—' : s < 60 ? `${Math.round(s)}s ago` : `${Math.round(s / 60)}m ago`)
export const clock = (ts) => new Date(ts * 1000).toLocaleTimeString()

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-300 overflow-x-auto">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px ${value === k ? 'border-navy text-navy' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
      ))}
    </div>
  )
}

export function Btn({ children, onClick, tone = 'navy', disabled, small, title }) {
  const cls = { navy: 'bg-navy text-white hover:bg-navy-2', red: 'bg-red-700 text-white hover:bg-red-800', ghost: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50', amber: 'bg-amber-600 text-white hover:bg-amber-700', green: 'bg-emerald-700 text-white hover:bg-emerald-800' }[tone]
  return <button title={title} disabled={disabled} onClick={onClick} className={`${cls} rounded font-semibold disabled:opacity-40 ${small ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}>{children}</button>
}

export function useToggle(init) { const [v, s] = useState(init); return [v, () => s((x) => !x), s] }
