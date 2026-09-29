import { Src, Note, ago } from '../components/v6/ui'

const THEME = { NORMAL: '#166534', WATCH: '#92400E', ADVISORY: '#9A3412', ALERT: '#7F1D1D', 'NO DATA': '#334155' }

/** Resident view: surface status only. No underground operational detail is exposed here. */
export default function ResidentDashboard({ s }) {
  const surf = Math.max(0, ...s.nodes.filter((n) => !n.offline).map((n) => n.deform_idx))
  const active = s.nodes.some((n) => !n.offline)
  const lv = !active ? 'NO DATA' : surf >= 0.85 ? 'ALERT' : surf >= 0.5 ? 'ADVISORY' : surf >= 0.2 ? 'WATCH' : 'NORMAL'
  const MSG = { NORMAL: 'No active surface hazard detected', WATCH: 'Minor ground movement is being monitored', ADVISORY: 'Elevated surface risk — avoid the marked area', ALERT: 'Surface hazard — follow official instructions', 'NO DATA': 'Monitoring data is not currently available' }
  const bg = THEME[lv]
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy text-white px-4 py-2 text-xs font-semibold tracking-wide flex items-center justify-between">
        <span>SAMADHAAN — COMMUNITY SAFETY NOTICE</span>
        {s.demo.active && <span className="bg-white/15 rounded px-2 py-0.5">SIMULATION MODE</span>}
      </header>
      <div className="max-w-xl mx-auto p-3 space-y-3">
        <div role="status" aria-live="polite" className="rounded border-2 text-white text-center py-7 px-3" style={{ background: bg, borderColor: bg }}>
          <div className="text-[11px] tracking-widest opacity-80">COMMUNITY STATUS</div>
          <div className="text-3xl font-extrabold my-1">{lv}</div>
          <div className="text-base">{MSG[lv]}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded p-3">
          <div className="text-[11px] font-bold text-slate-500 tracking-wide">MONITORED MINE</div>
          <div className="text-lg font-bold">{s.mine.name}</div>
          <div className="text-sm text-slate-600">{s.mine.location}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded p-3">
          <div className="text-[11px] font-bold text-slate-500 tracking-wide mb-1 flex items-center gap-2">SURFACE DEFORMATION TREND <Src s="ESTIMATED" /></div>
          <svg viewBox="0 0 600 70" className="w-full" role="img" aria-label="surface deformation trend">
            <polyline fill="none" stroke={bg} strokeWidth="3" points={s.twin.surface_profile.map(([x, d]) => `${x},${20 + d * 40}`).join(' ')} />
            <line x1="0" x2="600" y1="20" y2="20" stroke="#94A3B8" strokeDasharray="4" />
          </svg>
          <Note>Illustrative index derived from monitoring data, not a surveyed subsidence measurement.</Note>
        </div>

        <div className="bg-white border border-slate-200 rounded p-3">
          <div className="text-[11px] font-bold text-slate-500 tracking-wide">ALERTS</div>
          {s.alerts.length === 0
            ? <p className="text-sm mt-1">No alerts. Last update: {s.real_node.connected ? ago(s.real_node.age) : 'not available'}.</p>
            : <p className="text-sm font-semibold mt-1">A safety advisory is active for the mine area. Follow instructions from local authorities.</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded p-3 text-sm">
          <div className="text-[11px] font-bold text-slate-500 tracking-wide mb-1">SAFE AREAS &amp; EMERGENCY INFORMATION</div>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Safe assembly area: <i>to be configured by local authority</i></li>
            <li>Emergency contact: <i>placeholder — add the district control-room number</i></li>
          </ul>
        </div>

        <Note>Prototype early-warning information. Not a certified public-safety instrument.</Note>
      </div>
    </div>
  )
}
