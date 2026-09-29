import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { Line } from 'react-chartjs-2'
import { Chart as CJ, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import { Card, LevelChip, Src, Val, STATUS_COLOR, ago, Btn, Tabs } from './ui'
import { usePoll, api } from '../../hooks/useSamadhaan'
CJ.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

export function NodeQR({ id }) {
  const ref = useRef(null)
  const url = `${window.location.origin}/nodes/${id}`
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (ref.current) QRCode.toCanvas(ref.current, url, { width: 100, margin: 1 }).catch(() => {}) }, [id, url])
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  return (
    <div className="text-center">
      <canvas ref={ref} aria-label={`QR code linking to ${id}`} />
      <div className="text-[9px] text-slate-500 mt-1">{id}</div>
      <button className="text-[9px] underline text-slate-500" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy link'}</button>
      {isLocal && <div className="text-[9px] text-amber-700 mt-1 max-w-[110px]">Open this dashboard using the computer's network address (not localhost) for the code to work on a phone.</div>}
    </div>
  )
}

export function NodeGrid({ nodes, selected, onSelect }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {nodes.map((n) => {
        const col = STATUS_COLOR[n.status] || '#94A3B8'
        const v = n.values
        return (
          <button key={n.id} onClick={() => onSelect(n.id)} aria-label={`Open ${n.id}`}
            className={`text-left bg-white border rounded shadow-sm p-3 hover:shadow ${selected === n.id ? 'ring-2 ring-navy' : 'border-slate-200'}`} style={{ borderLeft: `5px solid ${col}` }}>
            <div className="flex justify-between items-center">
              <span className="font-mono font-bold text-sm">{n.id}</span>
              <span className="text-[10px] font-bold" style={{ color: col }}>{n.status_label}</span>
            </div>
            <div className="text-[10px] text-slate-500 mb-1">Sector {n.sector} &middot; {n.gallery} &middot; {n.depth_m ? `${n.depth_m} m` : 'depth n/a'} &middot; <Src s={n.source} /></div>
            <div className="flex items-center gap-2 mb-1"><span className="font-mono text-lg font-bold">{n.offline ? '--' : n.risk}</span><LevelChip level={n.level} /></div>
            <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-600">
              <span>Pitch <b>{v.pitch == null ? 'N/C' : n.values.pitch_dev.toFixed(1) + '°'}</b></span>
              <span>Roll <b>{v.roll == null ? 'N/C' : n.values.roll_dev.toFixed(1) + '°'}</b></span>
              <span>Strain <b>{v.strain_dev == null ? 'N/C' : v.strain_dev.toFixed(1) + '%'}</b></span>
              <span>Vib <b>{v.vibration == null ? 'N/C' : v.vibration.toFixed(0)}</b></span>
              <span>Temp <b>{v.temperature == null ? 'N/C' : v.temperature.toFixed(1) + '°C'}</b></span>
              <span>Hum <b>{v.humidity == null ? 'N/C' : v.humidity.toFixed(0) + '%'}</b></span>
              <span>Batt <b>{v.battery_pct == null ? 'N/A' : v.battery_pct + '%'}</b></span>
              <span>RSSI <b>{n.rssi == null ? 'N/A' : n.rssi + ' dBm'}</b></span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex justify-between"><span>{n.link || 'no link'} &middot; {ago(n.last_seen_age)}</span><span>Conf {n.confidence}% &middot; Rel {n.reliability}%</span></div>
          </button>
        )
      })}
    </div>
  )
}

const RANGES = [['1m', '1 min'], ['10m', '10 min'], ['1h', '1 hour'], ['1d', '1 day'], ['custom', 'Custom']]
function History({ id }) {
  const [rng, setRng] = useState('10m'); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const q = rng === 'custom' && from ? `&start=${new Date(from).getTime() / 1000}&end=${to ? new Date(to).getTime() / 1000 : Date.now() / 1000}` : ''
  const d = usePoll(`/api/v1/nodes/${id}/history?range=${rng}${q}`, 3000, [rng, from, to, id])
  const pts = d?.points || []
  const labels = pts.map((p) => new Date(p.ts * 1000).toLocaleTimeString())
  const ds = (label, key, color, dash) => ({ label, data: pts.map((p) => p[key]), borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 1.6, tension: .25, spanGaps: false, borderDash: dash })
  return (
    <div>
      <div className="flex gap-2 items-center flex-wrap mb-2">
        {RANGES.map(([k, l]) => <Btn key={k} small tone={rng === k ? 'navy' : 'ghost'} onClick={() => setRng(k)}>{l}</Btn>)}
        {rng === 'custom' && <><input type="datetime-local" className="border text-xs p-1" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="datetime-local" className="border text-xs p-1" value={to} onChange={(e) => setTo(e.target.value)} /></>}
        <Src s="OBSERVED" /> {d?.source === 'SIMULATION' && <Src s="SIMULATION" />}
        <span className="text-[10px] text-slate-500">{pts.length} points from stored telemetry (gaps = sensor not connected / no data)</span>
      </div>
      <div className="h-56"><Line data={{ labels, datasets: [ds('Pitch dev °', 'pitch_dev', '#0369A1'), ds('Roll dev °', 'roll_dev', '#0F766E'), ds('Strain dev %', 'strain_dev', '#B45309'), ds('Vibration', 'vibration', '#7C3AED', [4, 3]), ds('Risk', 'risk', '#B71C1C')] }}
        options={{ animation: false, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 9 } } }, y: { ticks: { font: { size: 9 } } } } }} /></div>
    </div>
  )
}

const HC = { HEALTHY: '#2E7D32', DEGRADED: '#E65100', FAILED: '#B71C1C', 'NOT CONNECTED': '#64748B' }
export function SensorHealth({ n }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">Sensor</th><th>Status</th><th>Last valid</th><th>Rate</th><th>Quality</th><th>Detail</th></tr></thead>
      <tbody>{n.sensor_health.map((s) => (
        <tr key={s.sensor} className="border-b border-slate-100">
          <td className="py-1.5 font-semibold">{s.sensor}</td>
          <td><span className="font-bold" style={{ color: HC[s.status] || '#475569' }}>{s.status}</span></td>
          <td>{s.last_valid_age == null ? '—' : ago(s.last_valid_age)}</td><td>{s.hz ? s.hz + ' Hz' : '—'}</td><td>{s.quality == null ? '—' : s.quality + '%'}</td>
          <td className="text-slate-500">{Object.entries(s.detail).map(([k, v]) => `${k}: ${v == null ? 'n/a' : v}`).join(' · ')}</td>
        </tr>))}</tbody></table>
      <p className="text-[10px] text-slate-500 mt-1">Node health (can I trust this node?) is separate from structural risk (what is happening to the mine?). Quality states per channel: {Object.entries(n.quality).map(([k, v]) => `${k}=${v}`).join(', ')}</p>
    </div>
  )
}

export function NodeDetail({ n, onClose, canEdit = true }) {
  const [tab, setTab] = useState('live'); const [msg, setMsg] = useState('')
  const cal = () => api(`/api/v1/nodes/${n.id}/calibrate`, 'POST').then((r) => setMsg(r.message)).catch((e) => setMsg('Calibration failed: ' + e.message))
  const b = n.baseline
  return (
    <Card title={`${n.id} — ${n.label}`} accent={STATUS_COLOR[n.status]} sub={`Sector ${n.sector} · gallery ${n.gallery} · nearby ${n.nearby.join(', ') || '—'} · installed: ${n.installed} · firmware ${n.firmware || 'n/a'}`}
      right={<><Src s={n.source} /><LevelChip level={n.level} /><Btn small tone="ghost" onClick={onClose}>Close</Btn></>}>
      <Tabs tabs={[['live', 'Live telemetry'], ['hist', 'History'], ['health', 'Sensor health'], ['base', 'Baseline & calibration']]} value={tab} onChange={setTab} />
      <div className="pt-3">
        {tab === 'live' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[['Pitch dev', n.values.pitch == null ? null : n.values.pitch_dev, '°'], ['Roll dev', n.values.roll == null ? null : n.values.roll_dev, '°'], ['Strain dev', n.values.strain_dev, '%'], ['Vibration', n.values.vibration, ''],
              ['Temperature', n.values.temperature, '°C'], ['Humidity', n.values.humidity, '%'], ['Battery', n.values.battery_pct, '%'], ['RSSI', n.rssi, ' dBm']].map(([l, v, u]) => (
              <div key={l} className="border rounded p-2"><div className="text-[10px] text-slate-500 uppercase">{l}</div><Val v={v} unit={u} source={v == null ? null : n.source} missing={l === 'Battery' ? 'N/A' : l === 'RSSI' ? 'N/A (USB)' : 'NOT CONNECTED'} /></div>))}
            <div className="col-span-2 md:col-span-4 flex gap-3 items-start"><NodeQR id={n.id} /><div className="text-[11px] text-slate-600">Link <b>{n.link || 'none'}</b> &middot; power <b>{n.power || 'n/a'}</b> &middot; last seen <b>{ago(n.last_seen_age)}</b> &middot; packets {n.packets.received} rx / {n.packets.lost} lost &middot; uptime {n.uptime ?? 'n/a'} s</div></div>
            {n.transient && <div className="col-span-2 md:col-span-4 border-l-4 border-amber-500 bg-amber-50 p-2"><b>TEMPORARY ANOMALY</b> &mdash; {n.transient.sensor}: peak +{Math.round(n.transient.peak)} &middot; duration {Number(n.transient.duration || 0).toFixed(1)} s &middot; tilt {n.transient.tilt_normal === false ? 'DEVIATING' : 'NORMAL'} &middot; strain {n.transient.strain_normal === false ? 'DEVIATING' : 'NORMAL'} &rarr; <b>{n.transient.classification || 'LIKELY TRANSIENT DISTURBANCE'}</b></div>}
          </div>)}
        {tab === 'hist' && <History id={n.id} />}
        {tab === 'health' && <SensorHealth n={n} />}
        {tab === 'base' && (
          <div className="text-xs space-y-2">
            <div className="flex gap-2 items-center flex-wrap"><b>Baseline: SELF-LEARNED</b> (per node) &middot; learning state <b style={{ color: n.learning === 'ACTIVE' ? '#2E7D32' : '#E65100' }}>{n.learning}</b>{n.freeze_reason && <span> (frozen: {n.freeze_reason})</span>} &middot; adaptation baseline_new = {(1 - n.alpha).toFixed(2)}&times;old + {n.alpha}&times;current &middot; {n.calibration}</div>
            <table className="text-xs"><thead><tr className="text-left text-slate-500"><th className="pr-4">Channel</th><th className="pr-4">Baseline</th><th className="pr-4">Samples</th><th>Age</th></tr></thead>
              <tbody>{Object.entries(b).map(([k, v]) => <tr key={k}><td className="pr-4 font-mono">{k}</td><td className="pr-4">{v.value}</td><td className="pr-4">{v.n}</td><td>{Math.floor(v.age_s / 3600)}h {Math.floor((v.age_s % 3600) / 60)}m {v.age_s % 60}s</td></tr>)}</tbody></table>
            {canEdit && <div className="flex gap-2 items-center"><Btn onClick={cal} disabled={n.offline}>CALIBRATE NODE</Btn><span className="text-slate-500">Keep the node stationary, then press. Saves this node's baseline from current readings.</span> <b>{msg}</b></div>}
          </div>)}
      </div>
    </Card>
  )
}
