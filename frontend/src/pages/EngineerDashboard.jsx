import { useState, useEffect } from 'react'
import App from '../App'
import { Card, Stat, LevelChip, Src, Tabs, Btn, ago } from '../components/v6/ui'
import { NodeGrid, NodeDetail } from '../components/v6/Nodes'
import { ExplainRisk, Chain } from '../components/v6/Risk'
import Twin, { Network } from '../components/v6/Twin'
import { ScenarioLab, IncidentCentre, Analytics, SystemHealth } from '../components/v6/Ops'
import { usePoll } from '../hooks/useSamadhaan'
import { TiltChart, SoundChart, RiskChart } from '../components/Charts'

function Overview({ s, sel, setSel }) {
  const node = s.nodes.find((n) => n.id === sel) || s.nodes[0]
  const hist = usePoll(`/api/v1/nodes/${node.id}/history?range=10m`, 3000, [node.id])
  const h = (hist?.points || []).map((p) => ({ ...p, sound: p.vibration, risk_score: p.risk, timestamp: new Date(p.ts * 1000).toISOString() }))
  return (
    <div className="space-y-4">
      <div className="grid xl:grid-cols-[1.35fr_1fr] gap-4">
        <Twin state={s} />
        <div className="space-y-4"><ExplainRisk n={node} thresholds={s.thresholds} />
          <Card title="Alert Centre" accent="#B71C1C" pad={false}>{s.alerts.length === 0 ? <p className="p-4 text-xs text-slate-500">No active alerts.</p> : <ul className="divide-y">{s.alerts.slice(0, 5).map((a) => <li key={a.id} className="px-4 py-2 text-xs"><LevelChip level={a.severity} /> <b>{a.location}</b> <span className="text-slate-500">{a.reason}</span><div className="text-slate-500">&rarr; {a.action}</div></li>)}</ul>}</Card></div>
      </div>
      <Card title={`Live sensor graphs — ${node.id}`} accent="#0369A1" right={<Src s="OBSERVED" />} sub="Real stored telemetry; gaps mean the sensor is not connected">
        <div className="grid md:grid-cols-3 gap-4"><TiltChart history={h} /><SoundChart history={h} /><RiskChart history={h} /></div></Card>
      <Card title="Node status grid" accent="#0A2540" sub="Click a node for the detail view"><NodeGrid nodes={s.nodes} selected={node.id} onSelect={(id) => { setSel(id); window.history.pushState({}, '', `/nodes/${id}`) }} /></Card>
      <Card title="Prototype pipeline" accent="#475569"><Chain n={node} /><p className="text-[10px] text-slate-500 mt-1">Real hardware and scenarios converge on the same processing pipeline; the final step is always human verification.</p></Card>
    </div>
  )
}

export default function EngineerDashboard({ s, health, initialNode, refresh }) {
  const [tab, setTab] = useState(initialNode ? 'nodes' : 'overview')
  const [picked, setPicked] = useState(initialNode || null)
  const followScn = s.scenario && s.scenario.state === 'RUNNING' ? s.scenario.params.node : null
  const sel = picked || followScn || 'NODE-01'
  const setSel = setPicked
  useEffect(() => { if (initialNode) { setPicked(initialNode); setTab('nodes') } }, [initialNode])
  const node = s.nodes.find((n) => n.id === sel) || s.nodes[0]
  const net = usePoll('/api/v1/network', 4000)
  const k = s.kpis
  return (
    <div className="max-w-[1700px] mx-auto px-4 py-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-stretch">
        <Stat label="Mine" value={s.mine.name.split(' ')[0]} sub={<Src s="CONFIGURED" />} />
        <Stat label="Risk" value={k.risk} tone={k.risk === 'SAFE' ? 'good' : k.risk === 'CAUTION' ? 'warn' : k.risk === 'UNKNOWN' ? '' : 'bad'} />
        <Stat label="Workers underground" value={k.workers} sub="configured figure" />
        <Stat label="Nodes online" value={`${k.online}/${k.nodes_total}`} tone={k.offline ? 'warn' : 'good'} sub={`${k.degraded} degraded`} />
        <Stat label="Open incidents" value={k.incidents_open} tone={k.incidents_open ? 'bad' : 'good'} />
        <Stat label="Pipeline" value={s.pipeline} tone={s.pipeline === 'Healthy' ? 'good' : 'warn'} sub={`sync: ${s.sync.state}`} />
        <Stat label="Real NODE-01" value={s.real_node.connected ? 'CONNECTED' : 'WAITING'} tone={s.real_node.connected ? 'good' : 'warn'} sub={s.real_node.connected ? `${s.real_node.link} · ${ago(s.real_node.age)}` : 'no telemetry received'} />
      </div>
      <Tabs tabs={[['overview', 'Command'], ['nodes', 'Nodes & detail'], ['scenario', 'Scenario Lab'], ['incidents', 'Incidents'], ['analytics', 'Analytics'], ['health', 'System health & network'], ['console', 'Live console (classic)']]} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview s={s} sel={sel} setSel={setSel} />}
      {tab === 'nodes' && <div className="space-y-4"><NodeGrid nodes={s.nodes} selected={sel} onSelect={setSel} /><NodeDetail n={node} onClose={() => setTab('overview')} /><ExplainRisk n={node} thresholds={s.thresholds} /></div>}
      {tab === 'scenario' && <div className="grid xl:grid-cols-[1.1fr_1fr] gap-4"><ScenarioLab state={s} /><Twin state={s} /></div>}
      {tab === 'incidents' && <IncidentCentre state={s} refresh={refresh} />}
      {tab === 'analytics' && <Analytics />}
      {tab === 'health' && <div className="space-y-4"><SystemHealth state={s} health={health} /><Network net={net} /></div>}
      {tab === 'console' && <div className="border rounded overflow-hidden"><div className="bg-emerald-50 text-emerald-900 text-[11px] px-3 py-1"><b>REAL TELEMETRY ONLY</b> &mdash; the classic console shows the physical ESP32 node (never simulated data).</div><App /></div>}
    </div>
  )
}
