import { useState } from 'react'
import { Card, LevelChip, Src } from './ui'

/** Explainable risk: WHY the score is what it is. Contributions are additive; weights live in backend config. */
export function ExplainRisk({ n, thresholds }) {
  const [open, setOpen] = useState(true)
  if (!n) return null
  const total = n.contributions.reduce((a, c) => a + c.points, 0)
  return (
    <Card title={`WHY ${n.offline ? '--' : n.risk}?  — ${n.id}`} accent="#B71C1C" sub="Transparent weighted evidence score (0–100)"
      right={<><Src s={n.source} /><Src s="ESTIMATED" title="Derived mathematically from telemetry" /><button className="text-[11px] underline text-slate-600" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Explain risk'}</button></>}>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="font-mono text-4xl font-bold">{n.offline ? '--' : n.risk}<span className="text-base text-slate-400">/100</span></div>
        <LevelChip level={n.level} big />
        <div className="text-xs"><div>Data confidence <b>{n.confidence}%</b> <span className="text-slate-400">(prototype indicator)</span></div><div>Corroborating evidence sources <b>{n.corroborating}</b></div></div>
      </div>
      <div className={`text-sm font-semibold mb-2 ${n.level === 'UNKNOWN' ? 'text-slate-700' : ''}`}>&rarr; {n.decision}</div>
      {open && <>
        {n.contributions.map((c) => (
          <div key={c.key} className="mb-1.5">
            <div className="flex justify-between text-xs"><span>{c.label} <b className="font-mono ml-1">{c.value}</b></span><span className="font-mono">+{c.points} / {c.max}</span></div>
            <div className="h-1.5 bg-slate-100 rounded overflow-hidden"><div className="h-full" style={{ width: `${(c.points / c.max) * 100}%`, background: c.points > 0 ? '#B71C1C' : '#CBD5E1' }} /></div>
          </div>))}
        <div className="border-t mt-2 pt-1 text-xs flex justify-between font-semibold"><span>RISK SCORE</span><span className="font-mono">{total.toFixed(0)} / 100</span></div>
        {n.notes.map((t, i) => <p key={i} className="text-[11px] mt-1 bg-amber-50 border-l-4 border-amber-400 p-1.5">{t}</p>)}
        {n.confidence_why?.length > 0 && <p className="text-[11px] text-slate-500 mt-1">Confidence reduced by: {n.confidence_why.join('; ')}</p>}
        <div className="mt-2 border rounded p-2 text-[11px] bg-slate-50">
          <b>Correlation logic:</b> vibration&nbsp;&uarr; + tilt&nbsp;&uarr; + strain&nbsp;&uarr; + persistence&nbsp;&uarr; = higher confidence; vibration&nbsp;&uarr; alone (tilt &amp; strain normal, short) = TRANSIENT EVENT &mdash; no subsidence alert.
          {n.ai && <div className="mt-1"><b>Pattern model:</b> {n.ai.statement || n.ai.verdict} <span className="text-slate-400">(one evidence input among several, not the deciding factor)</span></div>}
        </div>
        <p className="text-[10px] text-slate-500 mt-2">{thresholds?.note}. Levels: SAFE 0–34 &middot; CAUTION 35–59 &middot; HIGH 60–84 &middot; CRITICAL 85–100. Field verification required.</p>
      </>}
    </Card>
  )
}

export function Chain({ n }) {
  const steps = ['SENSE', 'FILTER', 'LEARN', 'CROSS-CHECK', 'DETECT', 'SCORE', 'EXPLAIN', 'VISUALIZE', 'ALERT', 'ROUTE', 'RECOVER', 'VERIFY']
  return <div className="flex flex-wrap gap-1 text-[9px] font-bold text-slate-500">{steps.map((s, i) => <span key={s} className="px-1.5 py-0.5 bg-slate-100 rounded">{i + 1}. {s}</span>)}</div>
}
