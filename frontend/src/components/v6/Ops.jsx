import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { Line, Bar } from 'react-chartjs-2'
import { Card, LevelChip, Src, Btn, Stat, Note, clock, ago } from './ui'
import { api, usePoll } from '../../hooks/useSamadhaan'

const PRESET_LIST = [['normal', '1. Normal operation'], ['machinery', '2. Machinery vibration'], ['impact', '3. Sudden impact'], ['gradual', '4. Gradual subsidence'], ['rapid', '5. Rapid deformation'],
  ['sensor_failure', '6. Sensor failure'], ['comm_failure', '7. Communication failure'], ['multi_node', '8. Multiple-node anomaly'], ['ventilation', '9. Ventilation failure'], ['combined', '10. Combined disaster']]
const DEMOS = [['A', 'RUN FALSE ALARM', 'green'], ['B', 'RUN SUBSIDENCE', 'red'], ['C', 'RUN NETWORK FAILURE', 'amber'], ['D', 'RUN NODE FAILURE', 'amber'], ['E', 'RUN MASS INCIDENT', 'red']]
const blank = { node: 'NODE-03', duration: 60, tilt: 8, strain: 20, vibration: 'rising', temp_delta: 0, comm: 'ON', sensor_fail: '', workers: 126, ventilation: 'NORMAL', speed: 'medium' }

export function exportReportPDF(r) {
  const d = new jsPDF(); let y = 16
  const line = (t, s = 10, b = false) => { d.setFont('helvetica', b ? 'bold' : 'normal'); d.setFontSize(s); d.splitTextToSize(String(t), 180).forEach((l) => { if (y > 280) { d.addPage(); y = 16 } d.text(l, 15, y); y += s * 0.5 + 2 }) }
  line('SAMADHAAN — Scenario Report', 16, true); line('SIMULATION DATA — not live mine telemetry. Prototype; not a certified structural-safety instrument.', 9)
  y += 2; line(`${r.scenario} (${r.id})`, 12, true)
  line(`Duration: ${r.duration_s}s | Peak risk: ${r.peak_risk}/100 (${r.peak_level}) | Nodes affected: ${r.nodes_affected.join(', ') || 'none'} | Route changes: ${r.route_changes}`)
  line(`Outcome: ${r.outcome}`, 10, true); line(`Recovery: ${r.recovery}`)
  y += 2; line('Response timeline', 11, true); r.response_timeline.forEach((t) => line(`T+${String(t.t).padStart(2, '0')}  ${t.label}`))
  y += 2; line('Alerts generated', 11, true); if (!r.alerts_generated.length) line('None'); r.alerts_generated.forEach((a) => line(`${a.id} ${a.node} ${a.severity} peak ${a.risk}`))
  y += 2; line('Anomalies', 11, true); r.anomalies.forEach((a) => line(`${a.category}: ${a.message}`))
  d.save(`${r.id}_report.pdf`)
}

export function ScenarioLab({ state }) {
  const [p, setP] = useState(blank); const [err, setErr] = useState('')
  const sc = state.scenario; const running = sc && sc.state === 'RUNNING'
  const set = (k, v) => setP({ ...p, [k]: v })
  const sims = state.nodes.filter((n) => n.source === 'SIMULATION')
  const run = async (fn) => { setErr(''); try { await fn() } catch (e) { setErr(e.message) } }
  const create = () => run(async () => { const c = await api('/api/v1/scenarios', 'POST', { ...p, sensor_fail: p.sensor_fail || null, duration: +p.duration, tilt: +p.tilt, strain: +p.strain, temp_delta: +p.temp_delta, workers: +p.workers }); await api(`/api/v1/scenarios/${c.id}/run`, 'POST') })
  const load = async (k) => { const r = await api('/api/v1/scenarios/presets'); const d = r.presets[k]; setP({ ...blank, ...d, node: d.node || 'NODE-03', sensor_fail: d.sensor_fail || '' }) }
  return (
    <div className="space-y-4">
      <Card title="SCENARIO LAB — simulation controls" accent="#6B21A8" right={<Src s="SIMULATION" />} sub="Scenarios generate coherent synthetic telemetry through the same processing pipeline as real hardware. The physical node connected over USB is never simulated.">
        <div className="flex flex-wrap gap-2 mb-3">
          {DEMOS.map(([k, l, t]) => <Btn key={k} tone={t} disabled={running} onClick={() => run(() => api(`/api/v1/scenarios/run-demo/${k}`, 'POST'))}>{l}</Btn>)}
          <Btn tone="ghost" onClick={() => run(() => api('/api/v1/reset', 'POST'))}>RESET</Btn>
          {running && <Btn tone="red" onClick={() => run(() => api(`/api/v1/scenarios/${sc.id}/stop`, 'POST'))}>STOP</Btn>}
        </div>
        {err && <p className="text-xs text-red-700 mb-2">{err}</p>}
        <div className="text-[11px] text-slate-600 mb-2"><b>CREATE SCENARIO</b> &mdash; load a type, tune parameters, then RUN:</div>
        <div className="flex flex-wrap gap-1 mb-3">{PRESET_LIST.map(([k, l]) => <button key={k} onClick={() => load(k)} className="text-[11px] px-2 py-1 border rounded bg-slate-50 hover:bg-slate-100">{l}</button>)}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <L t="Node"><select className="in" value={p.node} onChange={(e) => set('node', e.target.value)}>{sims.map((n) => <option key={n.id}>{n.id}</option>)}</select></L>
          <L t="Duration (s)"><input className="in" type="number" min="10" max="600" value={p.duration} onChange={(e) => set('duration', e.target.value)} /></L>
          <L t="Tilt end (°)"><input className="in" type="number" step="0.5" value={p.tilt} onChange={(e) => set('tilt', e.target.value)} /></L>
          <L t="Strain end (%)"><input className="in" type="number" step="1" value={p.strain} onChange={(e) => set('strain', e.target.value)} /></L>
          <L t="Vibration"><select className="in" value={p.vibration} onChange={(e) => set('vibration', e.target.value)}>{['normal', 'machinery', 'spike', 'rising', 'high'].map((x) => <option key={x}>{x}</option>)}</select></L>
          <L t="Temperature Δ (°C)"><input className="in" type="number" step="0.5" value={p.temp_delta} onChange={(e) => set('temp_delta', e.target.value)} /></L>
          <L t="Communication"><select className="in" value={p.comm} onChange={(e) => set('comm', e.target.value)}><option value="ON">Wi-Fi ON</option><option value="OFF">Outage mid-run</option></select></L>
          <L t="Sensor failure"><select className="in" value={p.sensor_fail} onChange={(e) => set('sensor_fail', e.target.value)}><option value="">none</option><option value="MPU6050">MPU6050 OFF</option><option value="STRAIN">Strain OFF</option><option value="SOUND">Sound OFF</option></select></L>
          <L t="Workers (SIM)"><input className="in" type="number" value={p.workers} onChange={(e) => set('workers', e.target.value)} /></L>
          <L t="Ventilation"><select className="in" value={p.ventilation} onChange={(e) => set('ventilation', e.target.value)}>{['NORMAL', 'DEGRADED', 'FAILED'].map((x) => <option key={x}>{x}</option>)}</select></L>
          <L t="Deformation speed"><select className="in" value={p.speed} onChange={(e) => set('speed', e.target.value)}>{['slow', 'medium', 'rapid'].map((x) => <option key={x}>{x}</option>)}</select></L>
          <div className="flex items-end"><Btn tone="navy" disabled={running} onClick={create}>RUN SCENARIO</Btn></div>
        </div>
        <style>{`.in{width:100%;border:1px solid #cbd5e1;border-radius:3px;padding:3px 5px;font-size:12px}`}</style>
      </Card>
      {sc && (
        <Card title={`${sc.params.name} — ${sc.state}`} accent="#6B21A8" right={<><Src s="SIMULATION" /><span className="text-xs font-mono">T+{String(sc.t).padStart(2, '0')} / {sc.duration}s</span></>}>
          <div className="h-1.5 bg-slate-100 rounded mb-3"><div className="h-1.5 bg-purple-700 rounded" style={{ width: `${Math.min(100, (sc.t / sc.duration) * 100)}%` }} /></div>
          {sc.outage && <p className="text-xs bg-amber-50 border-l-4 border-amber-500 p-2 mb-2"><b>OFFLINE MODE</b> &mdash; telemetry buffering locally ({sc.buffered} packets held). Will sync on reconnect.</p>}
          <div className="grid md:grid-cols-2 gap-4">
            <div><h3 className="text-xs font-bold mb-1">SCENARIO TIMELINE</h3>
              {sc.timeline.length === 0 && <p className="text-xs text-slate-500">{sc.warming_up ? 'Learning per-node baselines...' : 'Waiting...'}</p>}
              <ol className="text-xs space-y-1">{sc.timeline.map((t, i) => <li key={i} className="flex gap-2"><span className="font-mono text-purple-800 font-bold w-14">T+{String(t.t).padStart(2, '0')}</span><span>{t.label}</span></li>)}</ol></div>
            <div className="text-xs space-y-1"><div>Peak risk <b className="font-mono">{sc.peak}</b>/100</div>
              <div>Sync state <b>{state.sync.state}</b> {state.sync.synced ? `(${state.sync.synced} synced)` : ''}</div>
              <div>Pipeline <b>{state.pipeline}</b></div></div>
          </div>
          {sc.report && (
            <div className="mt-3 border-t pt-3"><h3 className="text-xs font-bold mb-1">SCENARIO REPORT</h3>
              <p className="text-xs">Outcome: <b>{sc.report.outcome}</b> &middot; peak {sc.report.peak_risk} ({sc.report.peak_level}) &middot; nodes affected: {sc.report.nodes_affected.join(', ') || 'none'} &middot; alerts {sc.report.alerts_generated.length} &middot; route changes {sc.report.route_changes}</p>
              <div className="flex gap-2 mt-2"><Btn small onClick={() => exportReportPDF(sc.report)}>Export PDF</Btn>
                <Btn small tone="ghost" onClick={() => { const b = new Blob([JSON.stringify(sc.report, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${sc.id}_report.json`; a.click() }}>Export JSON</Btn></div></div>)}
        </Card>)}
    </div>
  )
}
const L = ({ t, children }) => <label className="block"><span className="block text-[10px] uppercase text-slate-500 font-semibold">{t}</span>{children}</label>

export function IncidentCentre({ state, compact, refresh }) {
  const [who, setWho] = useState('Engineer-1')
  const [pending, setPending] = useState({})
  const [errors, setErrors] = useState({})
  const [confirmed, setConfirmed] = useState({})
  const act = async (id, a, note) => {
    setPending((p) => ({ ...p, [id]: a })); setErrors((e) => ({ ...e, [id]: null }))
    try {
      await api(`/api/v1/incidents/${id}/${a}`, 'POST', { by: who, note })
      if (refresh) await refresh()
      if (a === 'ESCALATE') { setConfirmed((c) => ({ ...c, [id]: true })); setTimeout(() => setConfirmed((c) => ({ ...c, [id]: false })), 6000) }
    } catch (e) {
      setErrors((er) => ({ ...er, [id]: e.message || 'Action failed — check the backend is reachable.' }))
    } finally {
      setPending((p) => ({ ...p, [id]: null }))
    }
  }
  const list = compact ? state.incidents.slice(0, 5) : state.incidents
  const col = { NEW: '#B71C1C', ACKNOWLEDGED: '#E65100', INVESTIGATING: '#0369A1', RESOLVED: '#2E7D32' }
  return (
    <Card title="Alert Centre — Incidents" accent="#B71C1C" sub="NEW → ACKNOWLEDGED → INVESTIGATING → RESOLVED, every action recorded. Engineer confirmation is required before any real evacuation."
      right={!compact && <input className="border rounded text-xs px-1.5 py-0.5" value={who} onChange={(e) => setWho(e.target.value)} aria-label="engineer name" />}>
      {list.length === 0 && <p className="text-xs text-slate-500">No incidents. System monitoring normally.</p>}
      <div className="space-y-2">{list.map((i) => (
        <div key={i.id} className="border rounded p-2 text-xs" style={{ borderLeft: `4px solid ${col[i.status]}` }}>
          <div className="flex justify-between flex-wrap gap-1"><span className="font-mono font-bold">#{i.id}</span><span className="flex gap-1 items-center"><Src s={i.source} /><LevelChip level={i.severity} /><b style={{ color: col[i.status] }}>{i.status}</b>{i.escalated && <span className="text-[10px] font-bold text-red-700 border border-red-300 bg-red-50 rounded px-1">ESCALATED</span>}</span></div>
          <div className="text-slate-600">{i.mine} &middot; Sector {i.sector} &middot; {i.node_id} &middot; risk <b>{i.risk}</b>/100 (peak {i.peak_risk}) &middot; {clock(i.ts)} &middot; assigned: <b>{i.assigned_to || '—'}</b></div>
          <div className="text-slate-500">Evidence: {i.evidence.join('; ') || '—'}</div>
          {!compact && <>
            <div className="flex gap-1 mt-1.5 flex-wrap items-center">
              <Btn small disabled={i.status !== 'NEW' || pending[i.id]} onClick={() => act(i.id, 'acknowledge')}>{pending[i.id] === 'acknowledge' ? 'ACKNOWLEDGING…' : 'ACKNOWLEDGE'}</Btn>
              <Btn small tone="ghost" disabled={i.status === 'RESOLVED' || pending[i.id]} onClick={() => act(i.id, 'assign', who)}>{pending[i.id] === 'assign' ? 'ASSIGNING…' : 'ASSIGN to me'}</Btn>
              <Btn small tone="amber" disabled={i.status === 'RESOLVED' || pending[i.id]} onClick={() => act(i.id, 'investigate')}>{pending[i.id] === 'investigate' ? 'UPDATING…' : 'INVESTIGATE'}</Btn>
              <Btn small tone="green" disabled={i.status === 'RESOLVED' || pending[i.id]} onClick={() => { const n = prompt('Resolution note'); if (n) act(i.id, 'resolve', n) }}>{pending[i.id] === 'resolve' ? 'RESOLVING…' : 'RESOLVE'}</Btn>
              <Btn small tone="red" disabled={i.escalated || pending[i.id]} onClick={() => act(i.id, 'escalate')}>{pending[i.id] === 'escalate' ? 'ESCALATING…' : i.escalated ? 'ESCALATED' : 'ESCALATE'}</Btn>
            </div>
            {errors[i.id] && <Note tone="warn">{errors[i.id]}</Note>}
            {confirmed[i.id] && <Note tone="good">Escalation recorded and broadcast to every connected console. This deployment has no SMS/email provider configured, so no external message was sent.</Note>}
            <details className="mt-1"><summary className="cursor-pointer text-slate-500">Action log ({i.actions.length})</summary>{i.actions.map((a, k) => <div key={k} className="text-[11px] text-slate-600">{clock(a.ts)} {a.action} by {a.by} {a.note ? `— ${a.note}` : ''}</div>)}{i.resolution_note && <div className="text-[11px]">Resolution: {i.resolution_note}</div>}</details></>}
        </div>))}</div>
    </Card>
  )
}

export function Analytics() {
  const [rng, setRng] = useState('1H'); const a = usePoll(`/api/v1/analytics?range=${rng}`, 5000, [rng])
  if (!a) return <p className="text-xs">Loading analytics...</p>
  const ec = a.event_classes
  return (
    <div className="space-y-4">
      <div className="flex gap-1 items-center">{['1H', '6H', '24H', '7D'].map((r) => <Btn key={r} small tone={rng === r ? 'navy' : 'ghost'} onClick={() => setRng(r)}>{r}</Btn>)}<span className="text-[10px] text-slate-500 ml-2">{a.retained_note}</span></div>
      <div className="flex flex-wrap gap-2"><Stat label="False alarms rejected" value={a.false_alarms_rejected} tone="good" /><Stat label="Structural events" value={a.critical_events} tone={a.critical_events ? 'bad' : ''} /><Stat label="Avg response" value={a.avg_response_s == null ? '—' : a.avg_response_s + 's'} /><Stat label="Avg latency" value={a.avg_latency_ms == null ? '—' : a.avg_latency_ms + ' ms'} /></div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Risk trend (max over online nodes)" accent="#B71C1C" right={<Src s="OBSERVED" />}><div className="h-52"><Line data={{ labels: a.risk_trend.map((p) => new Date(p.ts * 1000).toLocaleTimeString()), datasets: [{ label: 'Peak risk', data: a.risk_trend.map((p) => p.risk), borderColor: '#B71C1C', pointRadius: 0, tension: .25 }] }} options={{ animation: false, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 }, x: { ticks: { maxTicksLimit: 6 } } } }} /></div></Card>
        <Card title="Event classification (not just IF sensor HIGH → ALERT)" accent="#0369A1"><div className="h-52"><Bar data={{ labels: Object.keys(ec), datasets: [{ data: Object.values(ec), backgroundColor: ['#B71C1C', '#E65100', '#7C3AED', '#0369A1', '#2E7D32'] }] }} options={{ animation: false, maintainAspectRatio: false, plugins: { legend: { display: false } }, indexAxis: 'y' }} /></div></Card>
        <Card title="Node reliability score (node health, not structural risk)" accent="#0F766E"><div className="space-y-1">{Object.entries(a.node_reliability).map(([k, v]) => <div key={k} className="text-xs flex items-center gap-2"><span className="font-mono w-16">{k}</span><div className="flex-1 h-2 bg-slate-100 rounded"><div className="h-2 rounded" style={{ width: v + '%', background: v > 70 ? '#2E7D32' : v > 40 ? '#E65100' : '#B71C1C' }} /></div><span className="font-mono w-10 text-right">{v}%</span></div>)}</div></Card>
        <Card title="Sector-wise risk & node risk distribution" accent="#475569"><div className="flex gap-2 mb-2">{Object.entries(a.sector_risk).map(([s, l]) => <span key={s} className="text-xs">Sector {s}: <LevelChip level={l} /></span>)}</div>
          <table className="text-[11px] w-full"><thead><tr className="text-slate-500 text-left"><th>Node</th><th>SAFE</th><th>CAUTION</th><th>HIGH</th><th>CRITICAL</th></tr></thead><tbody>{Object.entries(a.node_risk_distribution).map(([k, c]) => <tr key={k}><td className="font-mono">{k}</td><td>{c.SAFE}</td><td>{c.CAUTION}</td><td>{c.HIGH}</td><td>{c.CRITICAL}</td></tr>)}</tbody></table></Card>
      </div>
      <Card title="Event log" accent="#475569"><div className="max-h-52 overflow-auto text-[11px] font-mono space-y-0.5">{[...a.event_log].reverse().map((e, i) => <div key={i}><span className="text-slate-400">{clock(e.ts)}</span> <b>{e.category}</b> [{e.source}] {e.node_id}: {e.message}</div>)}{a.event_log.length === 0 && 'No events yet.'}</div></Card>
    </div>
  )
}

export function SystemHealth({ state, health }) {
  const h = health
  const row = (k, v) => <div className="flex justify-between text-xs py-0.5 border-b border-slate-100"><span className="text-slate-500">{k}</span><span className="font-mono font-semibold">{v ?? '—'}</span></div>
  if (!h) return <p className="text-xs">Waiting for system health...</p>
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card title="Backend & storage" accent="#0A2540">{row('API', h.backend.api)}{row('WebSocket clients', h.backend.websocket_clients)}{row('Uptime', h.backend.uptime_s + ' s')}{row('Storage', h.storage.status)}{row('Engine', h.storage.engine)}{row('Latest record', h.storage.latest_record_age_s == null ? null : ago(h.storage.latest_record_age_s))}{row('Write failures', h.storage.write_failures)}{row('Self-healing pipeline', h.pipeline)}</Card>
      <Card title="Nodes, network, sensors" accent="#0369A1">{row('Nodes online / offline / degraded', `${h.nodes.online} / ${h.nodes.offline} / ${h.nodes.degraded}`)}{row('Packet loss (real node)', h.network.packet_loss_pct + '%')}{row('Avg RSSI', h.network.avg_rssi == null ? 'N/A' : h.network.avg_rssi + ' dBm')}{row('Latency', h.network.latency_ms == null ? 'not measured' : h.network.latency_ms + ' ms')}{row('Sensors healthy / degraded / failed', `${h.sensors.healthy} / ${h.sensors.degraded} / ${h.sensors.failed}`)}{row('Sensors not connected', h.sensors.not_connected)}{row('Offline sync', h.network.sync.state)}</Card>
      <Card title="Power & AI" accent="#6B21A8">{row('Real node power', h.power.real_node_power)}{row('Battery', h.power.battery_pct == null ? 'N/A (not wired)' : h.power.battery_pct + '%')}{row('Model', h.ai.version)}{row('Training samples', h.ai.samples)}{row('Last trained', h.ai.last_trained)}{row('Training source', h.ai.source)}{row('Model status', h.ai.status)}{row('Baselines', Object.values(h.ai.baseline).filter((x) => x === 'ACTIVE').length + ' ACTIVE / ' + Object.values(h.ai.baseline).filter((x) => x === 'FROZEN').length + ' FROZEN')}
        <p className="text-[10px] text-slate-500 mt-2">Self-healing here means communication &amp; data pipeline (reconnect, retry, buffer, dedupe) &mdash; hardware does not repair itself.</p></Card>
    </div>
  )
}
