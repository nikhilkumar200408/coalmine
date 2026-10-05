import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTelemetry, computeRiskScoreClientSide, fetchAISummary as fetchAISummaryRaw } from './hooks/useTelemetry'
import { speak, startSiren, stopSiren, playChime } from './utils/audioAlerts'
import { severityFromRisk } from './utils/severity'
import AdminHeader from './components/AdminHeader'
import EmergencyBanner from './components/EmergencyBanner'
import ToastAlerts from './components/ToastAlerts'
import MetricStrip from './components/MetricStrip'
import MapPanel from './components/MapPanel'
import MineShaftPanel from './components/MineShaftPanel'
import StratigraphyPanel from './components/StratigraphyPanel'
import CollapseAnimation from './components/CollapseAnimation'
import { TiltChart, SoundChart, RiskChart } from './components/Charts'
import AIRiskSummary from './components/AIRiskSummary'
import HardwareStatus from './components/HardwareStatus'
import PredictiveSlider from './components/PredictiveSlider'
import EvacuationLog from './components/EvacuationLog'
import RiskGauge from './components/RiskGauge'
import DataFlowStatus from './components/DataFlowStatus'
import IncidentReportButton from './components/IncidentReportButton'
import PersonnelAlertPanel from './components/PersonnelAlertPanel'

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

function Section({ children, delay = 0, className = '', hover = true }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.4, delay }}
      whileHover={hover ? { y: -3, boxShadow: '0 8px 24px rgba(15,23,42,0.08)' } : {}}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const TILT_RATE_THRESHOLD_DEG_PER_S = 1.5
const ACOUSTIC_SPIKE_THRESHOLD = 18
const ANNOUNCEMENT =
  'Attention all underground personnel. Ground movement has crossed critical threshold. Evacuate the affected sector immediately.'

let toastSeq = 0

export default function App() {
  const { latest, history, connected, transport, heartbeatLossPct, latencyMs } = useTelemetry()
  const [aiSummary, setAiSummary] = useState(null)
  const [toasts, setToasts] = useState([])
  const [liveEvents, setLiveEvents] = useState([])
  const [acknowledged, setAcknowledged] = useState(false)
  const prevSeverityRef = useRef('SAFE')
  const prevConnectedRef = useRef(connected)
  const lastEvalTimestampRef = useRef(null)

  const pitchDev = latest?.pitch_dev ?? 0
  const rollDev = latest?.roll_dev ?? 0
  const soundLevel = latest?.sound ?? 0
  const riskScore = latest?.risk_score ?? computeRiskScoreClientSide(pitchDev, rollDev, soundLevel)
  const severity = severityFromRisk(riskScore)
  const alarmCondition = riskScore > 70 || severity === 'DANGER'

  const pushEvent = useCallback((severityTag, message, timestamp) => {
    setLiveEvents((evts) => [...evts.slice(-39), { timestamp: timestamp || new Date().toISOString(), severity: severityTag, message }])
  }, [])

  const pushToast = useCallback((kind, message) => {
    const id = ++toastSeq
    setToasts((t) => [...t.slice(-4), { id, kind, message, time: new Date().toLocaleTimeString() }])
    playChime(kind === 'acoustic' ? 'info' : 'warn')
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  useEffect(() => {
    if (severity !== prevSeverityRef.current) {
      if (severity === 'DANGER') {
        speak(`Critical alert. Composite risk at Node ${latest?.node_id || '01'} has reached ${riskScore} out of 100. Immediate field verification recommended.`)
        pushEvent('CRITICAL', `Severity escalated to Critical Alert \u2014 risk score ${riskScore}/100`, latest?.timestamp)
      } else if (severity === 'CAUTION') {
        speak(`Advisory. Elevated ground movement detected at Node ${latest?.node_id || '01'}.`)
        pushEvent('WARN', `Severity elevated to Advisory \u2014 risk score ${riskScore}/100`, latest?.timestamp)
      } else if (prevSeverityRef.current !== 'SAFE') {
        pushEvent('INFO', `Severity returned to Nominal \u2014 risk score ${riskScore}/100`, latest?.timestamp)
      }
      prevSeverityRef.current = severity
    }
    if (!alarmCondition) setAcknowledged(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, riskScore, alarmCondition, latest?.node_id])

  useEffect(() => {
    if (alarmCondition && !acknowledged) {
      startSiren(ANNOUNCEMENT)
    } else {
      stopSiren()
    }
  }, [alarmCondition, acknowledged])

  useEffect(() => stopSiren, [])

  const handleAcknowledge = useCallback(() => {
    setAcknowledged(true)
    stopSiren()
    pushEvent('INFO', 'Alert acknowledged and muted by operator', new Date().toISOString())
  }, [pushEvent])

  useEffect(() => {
    if (prevConnectedRef.current !== connected) {
      pushEvent(connected ? 'INFO' : 'WARN', connected ? 'Telemetry link established' : 'Telemetry link lost \u2014 reconnecting...', new Date().toISOString())
      prevConnectedRef.current = connected
    }
  }, [connected, pushEvent])

  useEffect(() => {
    if (history.length < 2) return
    const cur = history[history.length - 1]
    const prev = history[history.length - 2]
    if (!cur?.timestamp || cur.timestamp === lastEvalTimestampRef.current) return
    lastEvalTimestampRef.current = cur.timestamp

    const dtSec = Math.max(0.5, (new Date(cur.timestamp) - new Date(prev.timestamp)) / 1000)
    const curTilt = Math.max(Math.abs(cur.pitch_dev || 0), Math.abs(cur.roll_dev || 0))
    const prevTilt = Math.max(Math.abs(prev.pitch_dev || 0), Math.abs(prev.roll_dev || 0))
    const tiltRate = Math.abs(curTilt - prevTilt) / dtSec

    if (tiltRate >= TILT_RATE_THRESHOLD_DEG_PER_S) {
      const msg = `\u0394\u03b8/\u0394t \u2248 ${tiltRate.toFixed(2)}\u00b0/s (baseline ${prevTilt.toFixed(1)}\u00b0 \u2192 ${curTilt.toFixed(1)}\u00b0)`
      pushToast('tilt', msg)
      pushEvent('WARN', `Sudden tilt-rate change detected \u2014 ${msg}`, cur.timestamp)
    }

    const soundDelta = (cur.sound || 0) - (prev.sound || 0)
    if (soundDelta >= ACOUSTIC_SPIKE_THRESHOLD) {
      const msg = `Acoustic level jumped +${soundDelta.toFixed(0)} (baseline ${(prev.sound || 0).toFixed(0)} \u2192 ${(cur.sound || 0).toFixed(0)})`
      pushToast('acoustic', msg)
      pushEvent('WARN', `Acoustic spike detected \u2014 ${msg}`, cur.timestamp)
    }
  }, [history, pushToast, pushEvent])

  useEffect(() => {
    if (!latest) return
    fetchAISummaryRaw()
      .then((s) => {
        if (s.risk_level) setAiSummary(s)
      })
      .catch(() => {})
  }, [latest?.timestamp])

  return (
    <div className="text-slate-800 min-h-screen relative bg-surface">
      {severity === 'DANGER' && !acknowledged && (
        <motion.div
          className="fixed inset-0 pointer-events-none z-40"
          animate={{ boxShadow: ['inset 0 0 0px rgba(211,47,47,0)', 'inset 0 0 60px rgba(211,47,47,0.18)', 'inset 0 0 0px rgba(211,47,47,0)'] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      )}

      <AdminHeader
        connected={connected}
        transport={transport}
        latencyMs={latencyMs}
        heartbeatLossPct={heartbeatLossPct}
        batteryPct={latest?.battery_pct}
        batterySensingOk={latest?.battery_sensing_ok}
        alarmActive={alarmCondition}
        acknowledged={acknowledged}
        onAcknowledge={handleAcknowledge}
      />

      <ToastAlerts toasts={toasts} onDismiss={dismissToast} />

      <main
        className="max-w-[1800px] mx-auto px-6 py-5 space-y-5"
        style={{
          background:
            'radial-gradient(circle at 15% 0%, rgba(10,37,64,0.04), transparent 45%), radial-gradient(circle at 100% 20%, rgba(56,142,60,0.04), transparent 40%)',
        }}
      >
        {severity !== 'SAFE' && (
          <Section>
            <EmergencyBanner severity={severity} riskScore={riskScore} nodeId={latest?.node_id} />
          </Section>
        )}

        <Section>
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 items-stretch">
            <div className="bg-white border border-slate-200 rounded p-3 flex items-center justify-center shadow-sm">
              <RiskGauge value={riskScore} />
            </div>
            <div className="space-y-3">
              <MetricStrip latest={latest} />
              <div className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between flex-wrap gap-3 shadow-sm">
                <DataFlowStatus
                  linkMode={latest?.link_mode}
                  connected={connected}
                  packetLossPct={heartbeatLossPct}
                  rssi={latest?.rssi}
                />
                <IncidentReportButton latest={latest} aiSummary={aiSummary} />
              </div>
            </div>
          </div>
        </Section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Section delay={0.05} className="bg-white border border-slate-200 border-t-4 border-t-sky-500 rounded xl:col-span-2 flex flex-col shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">Geospatial Risk Map</h2>
                <p className="text-xs text-slate-500">Live risk radial footprint &middot; registered node positions</p>
              </div>
              <span className="text-[10px] px-2 py-1 bg-slate-100 rounded text-slate-500 font-medium">1 NODE REGISTERED</span>
            </div>
            <div className="w-full h-[360px]">
              <MapPanel riskScore={riskScore} severity={severity} />
            </div>
          </Section>

          <Section delay={0.1} className="bg-white border border-slate-200 border-t-4 border-t-orange-400 rounded flex flex-col shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-sm">Underground Gallery Layout</h2>
              <p className="text-xs text-slate-500">Isometric room-and-pillar plan &middot; active/predicted failure sectors</p>
            </div>
            <div className="flex-1 min-h-[280px]">
              <MineShaftPanel pitchDev={pitchDev} rollDev={rollDev} riskScore={riskScore} severity={severity} />
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Section delay={0.05} className="bg-white border border-slate-200 border-t-4 border-t-rose-400 rounded flex flex-col shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-sm">Subsurface Deformation Schematic</h2>
              <p className="text-xs text-slate-500">Physics-animated cross-section driven live by pitch/roll/risk telemetry</p>
            </div>
            <div className="flex-1 min-h-[280px]">
              <CollapseAnimation pitchDev={pitchDev} rollDev={rollDev} riskScore={riskScore} soundLevel={soundLevel} />
            </div>
            <div className="px-4 py-2 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between">
              <span>
                Ground tilt: <span className="font-mono font-semibold text-slate-700">{rollDev.toFixed(1)}&deg;</span>
              </span>
              <span>
                Deformation index: <span className="font-mono font-semibold text-slate-700">{riskScore}/100</span>
              </span>
            </div>
          </Section>

          <Section delay={0.1} className="bg-white border border-slate-200 border-t-4 border-t-amber-400 rounded flex flex-col shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-sm">Geotechnical Stratigraphy Cross-Section</h2>
              <p className="text-xs text-slate-500">Topsoil &rarr; Sandstone &rarr; Shale &rarr; Coal Seam, with live displacement vectors</p>
            </div>
            <div className="flex-1 min-h-[280px]">
              <StratigraphyPanel pitchDev={pitchDev} rollDev={rollDev} riskScore={riskScore} />
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Section delay={0.05} className="bg-white border border-slate-200 border-t-4 border-t-sky-400 rounded p-4 shadow-sm">
            <h2 className="font-semibold text-sm mb-1">Geotechnical Tilt &mdash; Live Deviation</h2>
            <p className="text-xs text-slate-500 mb-2">Pitch &amp; roll deviation from calibrated baseline (2-axis MPU6050 tilt sensor)</p>
            <TiltChart history={history} />
          </Section>
          <Section delay={0.1} className="bg-white border border-slate-200 border-t-4 border-t-teal-400 rounded p-4 shadow-sm">
            <h2 className="font-semibold text-sm mb-1">Acoustic / Vibration Sensor Level</h2>
            <p className="text-xs text-slate-500 mb-2">Deviation from ambient acoustic baseline (crack-emission proxy)</p>
            <SoundChart history={history} />
          </Section>
          <Section delay={0.15} className="bg-white border border-slate-200 border-t-4 border-t-rose-400 rounded p-4 shadow-sm">
            <h2 className="font-semibold text-sm mb-1">Risk Score &mdash; Live vs Rolling Average</h2>
            <p className="text-xs text-slate-500 mb-2">Current node's composite risk score against its own historical baseline</p>
            <RiskChart history={history} />
          </Section>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Section delay={0.05} className="xl:col-span-2">
            <AIRiskSummary refreshKey={latest?.timestamp} />
          </Section>
          <Section delay={0.1}>
            <HardwareStatus latest={latest} heartbeatLossPct={heartbeatLossPct} latencyMs={latencyMs} />
          </Section>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Section delay={0.05} className="xl:col-span-2">
            <PredictiveSlider refreshKey={latest?.timestamp} />
          </Section>
          <Section delay={0.1}>
            <PersonnelAlertPanel severity={severity} riskScore={riskScore} nodeId={latest?.node_id} />
          </Section>
        </div>

        <Section>
          <EvacuationLog refreshKey={latest?.timestamp} liveEvents={liveEvents} />
        </Section>

        <footer className="text-[11px] text-slate-400 py-4 text-center">
          Mine Subsidence Early Warning System &mdash; Prototype for SIH 2026 Internal Evaluation. Telemetry
          sourced from a single physical ESP32 sensor node. Not a certified structural-safety instrument.
        </footer>
      </main>
    </div>
  )
}
