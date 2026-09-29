import { useState, useMemo } from 'react'
import { Card, Src, Tabs, LV, STATUS_COLOR, ago } from './ui'
import { usePoll } from '../../hooks/useSamadhaan'

const LAYERS = [['surface', 'Surface'], ['underground', 'Underground'], ['sensors', 'Sensors'], ['workers', 'Workers'], ['vent', 'Ventilation'], ['risk', 'Risk'], ['evac', 'Evacuation']]
const HEAT = [['node', 'Node risk'], ['underground', 'Underground risk'], ['surface', 'Surface risk'], ['anomaly', 'Anomaly density'], ['exposure', 'Worker exposure']]
const WINDOWS = [['current', 'Current'], ['1h', '1 Hour'], ['6h', '6 Hours'], ['24h', '24 Hours']]
const heatColor = (v) => { const a = Math.min(1, v / 100); return `rgba(${a > .6 ? 183 : 230},${a > .6 ? 28 : 120 - a * 60},${a > .6 ? 28 : 0},${0.06 + a * 0.5})` }

/** Professional engineering digital twin. Everything is derived from the shared platform state -- nothing animates independently. */
export default function Twin({ state, userSector = null }) {
  const [view, setView] = useState('plan')
  const [on, setOn] = useState({ surface: true, underground: true, sensors: true, workers: true, vent: true, risk: true, evac: true })
  const [heat, setHeat] = useState('node'); const [win, setWin] = useState('current'); const [pick, setPick] = useState([])
  const tw = usePoll(`/api/v1/digital-twin?layer=${heat === 'underground' ? 'node' : heat}&window=${win}`, 4000, [heat, win])
  const t = (win === 'current' && heat === 'node') ? state.twin : (tw || state.twin)
  const nodes = state.nodes, byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const sectors = state.sectors
  const route = state.routes[userSector || 'A']
  const flip = (id) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]))
  const dist = pick.length === 2 ? Math.hypot(byId[pick[0]].x - byId[pick[1]].x, byId[pick[0]].y - byId[pick[1]].y) : null
  const rp = route?.found ? route.junctions.map((j) => t.junctions[j]) : []
  const H = t.heat; const cw = 600 / H.nx, ch = 360 / H.ny
  return (
    <Card title="Digital Twin — Mine Projection" accent="#0A2540" pad={false}
      sub={`${state.mine.name} · illustrative mine geometry (not surveyed data)`} right={<><Src s="CONFIGURED" /><Src s="ESTIMATED" title={t.note} /><Src s={state.demo.active ? 'SIMULATION' : 'REAL'} /></>}>
      <div className="px-4 pt-2"><Tabs tabs={[['plan', 'Plan view'], ['section', 'Cross-section']]} value={view} onChange={setView} /></div>
      <div className="px-4 py-2 flex flex-wrap gap-1.5 items-center text-[11px]">
        {LAYERS.map(([k, l]) => <label key={k} className="flex items-center gap-1 bg-slate-100 rounded px-1.5 py-0.5"><input type="checkbox" checked={on[k]} onChange={() => setOn({ ...on, [k]: !on[k] })} />{l}</label>)}
        <select className="border rounded text-[11px] p-0.5" value={heat} onChange={(e) => setHeat(e.target.value)} aria-label="heatmap layer">{HEAT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="border rounded text-[11px] p-0.5" value={win} onChange={(e) => setWin(e.target.value)} aria-label="heatmap window">{WINDOWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <svg viewBox={view === 'plan' ? '-10 -10 700 380' : '-10 -20 620 400'} className="w-full bg-slate-50" style={{ maxHeight: 460 }} role="img" aria-label="mine digital twin">
        {view === 'plan' ? <>
          {on.risk && H.cells.map((v, i) => v > 4 && <rect key={i} x={(i % H.nx) * cw} y={Math.floor(i / H.nx) * ch} width={cw} height={ch} fill={heatColor(v)} />)}
          {sectors.map((s) => <g key={s.id}><rect x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} fill="none" stroke={LV[s.level]?.c || '#94A3B8'} strokeWidth={s.level === 'SAFE' ? 1 : 2.5} strokeDasharray="6 4" />
            <text x={s.rect[0] + 6} y={s.rect[1] + 14} fontSize="11" fontWeight="700" fill={LV[s.level].c}>{s.name} &middot; {LV[s.level].t}</text>
            {on.workers && <text x={s.rect[0] + 6} y={s.rect[1] + 28} fontSize="10" fill="#475569">{'\u{1F477}'} {s.workers} (SIM)</text>}</g>)}
          {on.underground && t.galleries.map((g) => { const blocked = route?.blocked?.includes(g.id); const vf = g.vent !== 'NORMAL'
            return <g key={g.id}><line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={blocked ? '#B71C1C' : '#64748B'} strokeWidth="7" strokeLinecap="round" opacity=".35" />
              {on.vent && <line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={vf ? '#B71C1C' : '#0284C7'} strokeWidth="1.5" strokeDasharray="3 5" className={vf ? '' : 'vent-flow'} />}
              {blocked && <text x={(g.a[0] + g.b[0]) / 2} y={(g.a[1] + g.b[1]) / 2 - 6} fontSize="9" fill="#B71C1C" fontWeight="700" textAnchor="middle">BLOCKED</text>}</g> })}
          {Object.entries(t.junctions).map(([k, [x, y]]) => <g key={k}><circle cx={x} cy={y} r="3.5" fill="#334155" />{t.exits[k] && <text x={x + 6} y={y - 8} fontSize="10" fontWeight="700" fill="#166534">EXIT: {t.exits[k]}</text>}</g>)}
          {on.vent && (() => { const [x, y] = t.junctions[t.vent_fan]; return <text x={x - 8} y={y + 18} fontSize="9" fill="#0369A1">Main fan (modelled)</text> })()}
          {on.evac && rp.length > 1 && <polyline points={rp.map((p) => p.join(',')).join(' ')} fill="none" stroke="#2E7D32" strokeWidth="4" strokeDasharray="10 6" className="route-flow" />}
          {on.sensors && nodes.map((n) => <g key={n.id} onClick={() => flip(n.id)} style={{ cursor: 'pointer' }} role="button" aria-label={n.id}>
            <circle cx={n.x} cy={n.y} r={pick.includes(n.id) ? 13 : 10} fill={STATUS_COLOR[n.status]} stroke={pick.includes(n.id) ? '#0A2540' : '#fff'} strokeWidth="2.5" />
            {n.level === 'CRITICAL' || n.level === 'HIGH' ? <circle cx={n.x} cy={n.y} r="10" fill="none" stroke="#B71C1C" className="pulse-ring" /> : null}
            <text x={n.x} y={n.y + 3.5} fontSize="8.5" fill="#fff" fontWeight="700" textAnchor="middle">{n.id.slice(-2)}</text></g>)}
        </> : <>
          {(() => { const surf = t.surface_profile; const sag = 34; const path = surf.map(([x, d]) => `${x},${40 + d * sag}`).join(' ')
            const layers = [['Topsoil', 0, 22, '#B08D57'], ['Sandstone', 22, 70, '#D6C7A1'], ['Shale', 70, 130, '#94A3B8'], ['Coal seam', 130, 160, '#1F2937'], ['Floor rock', 160, 220, '#64748B']]
            return <g>
              {layers.map(([nm, a, b, c]) => <g key={nm}><polygon points={`0,${40 + a * 1.2} ${surf.map(([x, d]) => `${x},${40 + a * 1.2 + d * sag * (1 - a / 260)}`).join(' ')} 600,${40 + b * 1.2} 0,${40 + b * 1.2}`} fill={c} opacity=".85" />
                <text x="6" y={40 + (a + b) * .6 + 3} fontSize="9" fill={nm === 'Coal seam' ? '#fff' : '#111827'} fontWeight="700">{nm}</text></g>)}
              {on.surface && <polyline points={path} fill="none" stroke="#166534" strokeWidth="3" />}
              {on.surface && <text x="590" y="30" fontSize="10" textAnchor="end" fill="#166534" fontWeight="700">SURFACE (estimated deformation profile)</text>}
              {on.underground && t.galleries.filter((g) => g.a[1] === g.b[1]).map((g) => <rect key={g.id} x={Math.min(g.a[0], g.b[0])} y={40 + 145 * 1.2 - 8} width={Math.abs(g.a[0] - g.b[0])} height="14" fill="#F8FAFC" stroke={LV[g.level].c} strokeWidth="1.5" opacity=".9" />)}
              {on.sensors && nodes.map((n) => <g key={n.id} onClick={() => flip(n.id)} style={{ cursor: 'pointer' }}><line x1={n.x} y1={40 + (surf.find((s) => s[0] === Math.round(n.x / 20) * 20)?.[1] || 0) * sag} x2={n.x} y2={40 + 145 * 1.2} stroke="#475569" strokeDasharray="2 3" />
                <circle cx={n.x} cy={40 + 145 * 1.2 - 1} r="8" fill={STATUS_COLOR[n.status]} stroke="#fff" strokeWidth="2" /><text x={n.x} y={40 + 145 * 1.2 + 2} fontSize="8" fill="#fff" textAnchor="middle" fontWeight="700">{n.id.slice(-2)}</text></g>)}
            </g> })()}
        </>}
      </svg>
      <div className="px-4 py-2 text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1 border-t">
        <span><b>Node distance:</b> {dist == null ? 'click two nodes' : `${pick[0]} ↔ ${pick[1]}: ${dist.toFixed(0)} m straight-line (configured coordinates)`}</span>
        {route?.found && on.evac && <span><b>Sector {userSector || 'A'} route:</b> {route.distance_m} m &middot; ~{Math.floor(route.time_s / 60)}m {route.time_s % 60}s &middot; {route.reason}</span>}
        <span className="text-slate-400">{t.note}</span>
      </div>
      <style>{`.route-flow{animation:dash 1.2s linear infinite}.vent-flow{animation:dash 2s linear infinite}@keyframes dash{to{stroke-dashoffset:-32}}.pulse-ring{animation:ring 1.4s ease-out infinite;transform-box:fill-box;transform-origin:center}@keyframes ring{from{transform:scale(1);opacity:.9}to{transform:scale(2.4);opacity:0}}`}</style>
    </Card>
  )
}

export function Network({ net }) {
  if (!net) return null
  const gx = 300, gy = 20
  const n = net.links.length
  return (
    <Card title="Sensor Network Topology" accent="#0369A1" sub="Gateway → nodes; link type shown as reported. LoRa is only shown if LoRa telemetry exists." right={<Src s="REAL" />}>
      <svg viewBox="0 0 600 150" className="w-full">
        <rect x={gx - 45} y={gy} width="90" height="22" rx="3" fill="#0A2540" /><text x={gx} y={gy + 15} fill="#fff" fontSize="10" textAnchor="middle" fontWeight="700">GATEWAY</text>
        {net.links.map((l, i) => { const x = 40 + i * (520 / Math.max(1, n - 1)); const c = l.status === 'ok' ? '#2E7D32' : l.status === 'weak' ? '#E65100' : '#94A3B8'
          return <g key={l.node}><line x1={gx} y1={gy + 22} x2={x} y2="95" stroke={c} strokeWidth="2" strokeDasharray={l.status === 'down' ? '4 4' : l.source === 'SIMULATION' ? '2 3' : ''} />
            <circle cx={x} cy="103" r="9" fill={c} /><text x={x} y="106" fontSize="8" fill="#fff" textAnchor="middle" fontWeight="700">{l.node.slice(-2)}</text>
            <text x={x} y="125" fontSize="8" textAnchor="middle" fill="#334155">{l.type}</text><text x={x} y="136" fontSize="8" textAnchor="middle" fill="#64748B">{l.rssi != null ? `${l.rssi} dBm` : l.status === 'down' ? 'down' : '—'}</text></g> })}
      </svg>
      <p className="text-[10px] text-slate-500">{net.note} Duplicate packets dropped: {net.duplicates_dropped}. Solid = real link, dotted = simulated mesh (SIM-MESH), dashed grey = down.</p>
    </Card>
  )
}
