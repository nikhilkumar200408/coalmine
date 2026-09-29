import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Card, Stat, LevelChip, Src, Note, ago } from '../components/v6/ui'
import { IncidentCentre } from '../components/v6/Ops'
import Twin from '../components/v6/Twin'
import { usePoll } from '../hooks/useSamadhaan'
import { Bar } from 'react-chartjs-2'

const COL = { SAFE: '#2E7D32', CAUTION: '#E65100', HIGH: '#BF360C', CRITICAL: '#B71C1C', UNKNOWN: '#64748B' }

/**
 * Multi-mine overview. Every linked mine is treated the same way: a mine's status reflects REAL
 * telemetry when a physical node is reporting for it, otherwise the platform shows the configured
 * (illustrative) figures for that mine until hardware is connected -- this view is generic
 * infrastructure for however many mines are onboarded, not specific to any one named mine.
 */
export default function GovernmentDashboard({ s, health, refresh }) {
  const info = usePoll('/api/v1/mine', 30000)
  const k = s.kpis
  const primary = { id: s.mine.id, name: s.mine.name, location: s.mine.location, lat: s.mine.lat, lng: s.mine.lng, nodes: k.nodes_total, online: k.online, workers: k.workers, risk: k.risk, vent: Object.values(s.sectors).some((x) => x.ventilation === 'FAILED') ? 'CRITICAL' : Object.values(s.sectors).some((x) => x.ventilation === 'DEGRADED') ? 'DEGRADED' : 'NORMAL', incidents: k.incidents_open, live: true, connected: s.real_node.connected, age: s.real_node.age }
  const mines = [primary, ...(info?.other_mines || []).map((m) => ({ ...m, live: false, connected: false }))]
  const sysOK = s.pipeline === 'Healthy'
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Stat label="Mines monitored" value={mines.length} /><Stat label="Nodes deployed" value={mines.reduce((a, m) => a + m.nodes, 0)} />
        <Stat label="Nodes online" value={mines.reduce((a, m) => a + m.online, 0)} tone="good" /><Stat label="Nodes offline" value={mines.reduce((a, m) => a + (m.nodes - m.online), 0)} tone="warn" />
        <Stat label="Workers underground" value={mines.reduce((a, m) => a + m.workers, 0)} sub="configured figures" /><Stat label="Active incidents" value={mines.reduce((a, m) => a + m.incidents, 0)} tone="bad" />
        <Stat label="Critical alerts" value={k.critical_alerts} tone={k.critical_alerts ? 'bad' : 'good'} /><Stat label="System health" value={s.pipeline} tone={sysOK ? 'good' : 'warn'} />
      </div>
      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4">
        <Card title="Geographic risk overview" accent="#0369A1" pad={false} right={<Src s="CONFIGURED" />}>
          <div className="h-[380px]"><MapContainer center={[23.7, 84.5]} zoom={6} scrollWheelZoom style={{ height: '100%' }}>
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {mines.map((m) => <CircleMarker key={m.id} center={[m.lat, m.lng]} radius={m.connected ? 14 : 10} pathOptions={{ color: COL[m.risk] || '#64748B', fillOpacity: .5 }}>
              <Popup><b>{m.name}</b><br />{m.location}<br />Risk: {m.risk}<br />Nodes {m.online}/{m.nodes}{m.connected ? '' : ' (awaiting hardware)'}</Popup></CircleMarker>)}
          </MapContainer></div>
          <div className="px-4 pb-3"><Note>Mine locations and node counts are configured values; markers enlarge once a mine's nodes are streaming telemetry.</Note></div>
        </Card>
        <IncidentCentre state={s} compact refresh={refresh} />
      </div>
      <Card title="Mine cards" accent="#0A2540"><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">{mines.map((m) => (
        <div key={m.id} className="border rounded p-3 text-xs" style={{ borderTop: `4px solid ${COL[m.risk] || '#64748B'}` }}>
          <div className="flex justify-between"><b className="text-sm">{m.name}</b><Src s={m.connected ? (s.demo.active ? 'SIMULATION' : 'REAL') : 'CONFIGURED'} /></div>
          <div className="text-slate-500 mb-2">{m.location}</div>
          <div className="grid grid-cols-2 gap-y-1"><span>Nodes</span><b>{m.online} / {m.nodes} ONLINE</b><span>Workers</span><b>{m.workers} underground</b><span>Risk</span><b><LevelChip level={m.risk} /></b><span>Ventilation</span><b>{m.vent} <span className="text-[9px] font-normal text-slate-400">(modelled)</span></b><span>Incidents</span><b>{m.incidents}</b><span>Last update</span><b>{m.connected ? ago(m.age) : 'no telemetry received'}</b><span>Network</span><b>{m.live ? s.pipeline : 'n/a'}</b></div></div>))}</div></Card>
      <div className="grid xl:grid-cols-2 gap-4">
        <Twin state={s} />
        <Card title="Mine comparison — nodes online (%)" accent="#475569" right={<Src s="CONFIGURED" />}>
          <div className="h-64"><Bar data={{ labels: mines.map((m) => m.name.split(' ')[0]), datasets: [{ label: 'Online %', data: mines.map((m) => Math.round(100 * m.online / m.nodes)), backgroundColor: mines.map((m) => COL[m.risk] || '#64748B') }] }} options={{ animation: false, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }} /></div>
          <Note>Bar colour reflects mine risk (icon and text are also shown on the mine cards; colour is never the only indicator). Historical analytics: see the Engineer view.</Note></Card>
      </div>
    </div>
  )
}
