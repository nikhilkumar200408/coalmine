import { useState } from 'react'
import { Src, LV, Note, clock } from '../components/v6/ui'

const THEME = { SAFE: '#166534', 'STAY ALERT': '#92400E', 'MOVE TO SAFE ZONE': '#9A3412', 'EVACUATE SECTOR': '#7F1D1D', 'LIMITED DATA': '#334155' }
const GALNAME = (g) => `Gallery ${g}`

/** Restrained, high-contrast, text-first status screen — deliberately plain rather than app-like. */
export default function WorkerDashboard({ s }) {
  const [sec, setSec] = useState('B')
  const sector = s.sectors.find((x) => x.id === sec)
  const r = s.routes[sec]
  const bg = THEME[sector.status_text] || THEME.SAFE
  const hazard = s.nodes.filter((n) => n.sector === sec && !n.offline && ['HIGH', 'CRITICAL', 'CAUTION'].includes(n.level)).sort((a, b) => b.risk - a.risk)[0]
  const alerts = s.alerts.filter((a) => a.severity !== 'SAFE').slice(0, 4)
  const bad = sector.level === 'HIGH' || sector.level === 'CRITICAL'
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy text-white px-4 py-2 text-xs font-semibold tracking-wide">SAMADHAAN — WORKER STATUS</header>
      <div className="max-w-xl mx-auto p-3 space-y-3 text-slate-900">
        <div className="flex gap-1 items-center text-xs bg-white border rounded p-2">
          <span className="font-semibold">Sector:</span>
          {s.sectors.map((x) => <button key={x.id} onClick={() => setSec(x.id)} className={`px-3 py-1.5 rounded border font-bold ${sec === x.id ? 'bg-navy text-white' : 'bg-white'}`} aria-pressed={sec === x.id}>{x.id}</button>)}
          <Src s="SIMULATION" title="Worker location is selected manually in this prototype; no personnel-tracking hardware is connected" />
        </div>

        <div role="status" aria-live="assertive" className="rounded border-2 text-white text-center py-6 px-3" style={{ background: bg, borderColor: bg }}>
          <div className="text-[11px] tracking-widest opacity-80 mb-1">CURRENT STATUS</div>
          <div className="text-3xl font-extrabold tracking-wide">{sector.status_text}</div>
          <div className="text-sm mt-1 opacity-90">{sector.name}</div>
        </div>
        {bad && <Note tone="warn">Recommended evacuation route below — engineer confirmation is required before this is treated as an official evacuation order.</Note>}

        {hazard && (
          <div className="border border-red-300 bg-white rounded p-3">
            <div className="text-[11px] font-bold text-red-800 tracking-wide">NEARBY HAZARD</div>
            <div className="text-lg font-bold">{hazard.id} — {hazard.gallery && GALNAME(hazard.gallery)}</div>
            <div className="text-sm text-slate-700">{hazard.decision}</div>
          </div>
        )}

        <div className="border border-emerald-300 bg-white rounded p-3">
          <div className="text-[11px] font-bold text-emerald-800 tracking-wide">NEAREST SAFE EXIT / ROUTE</div>
          {r?.found ? (
            <>
              <div className="text-xl font-extrabold">{r.exit_name}</div>
              <div className="text-lg font-mono">{r.distance_m} m &middot; ~{Math.floor(r.time_s / 60)} min {r.time_s % 60} s</div>
              <ol className="mt-2 text-base space-y-1 list-decimal pl-5">
                {r.galleries.map((g, i) => <li key={g + i}>Follow {GALNAME(g)}</li>)}
                <li className="font-bold">Exit: {r.exit_name}</li>
              </ol>
              <Note>{r.reason}</Note>
              {r.blocked.length > 0 && <Note tone="warn"><b>Blocked sections:</b> {r.blocked.join(', ')}</Note>}
            </>
          ) : <p className="text-lg font-bold text-red-800">{r?.reason || 'No route available.'}</p>}
        </div>

        <div className="border border-slate-200 bg-white rounded p-3">
          <div className="text-[11px] font-bold text-slate-700 tracking-wide mb-1">EMERGENCY INSTRUCTIONS</div>
          <ul className="text-base list-disc pl-5 space-y-0.5">
            <li>Stay calm. Do not use blocked galleries.</li>
            <li>Follow the route above; report to your supervisor at the exit.</li>
            <li>Ventilation: <b>{sector.ventilation}</b> <span className="text-xs text-slate-500">(modelled value)</span></li>
          </ul>
        </div>

        <div className="border border-slate-200 bg-white rounded p-3">
          <div className="text-[11px] font-bold text-slate-700 tracking-wide mb-1">ALERT CENTRE</div>
          {alerts.length === 0 ? <p className="text-sm text-slate-600">No active alerts.</p> :
            alerts.map((a) => (
              <div key={a.id} className="border-l-4 pl-2 mb-2 text-sm" style={{ borderColor: LV[a.severity]?.c }}>
                <b>{a.severity} — {a.location}</b>
                <div>{a.reason}</div>
                <div className="text-xs text-slate-600">Action: {a.action} &middot; {clock(a.time)}</div>
              </div>
            ))}
        </div>

        <Note>{s.demo.active ? 'SIMULATION — not live mine telemetry. ' : ''}Prototype decision support. Not a certified structural-safety instrument.</Note>
      </div>
    </div>
  )
}
