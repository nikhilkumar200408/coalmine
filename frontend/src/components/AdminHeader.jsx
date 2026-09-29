import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function StatChip({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warn'
      ? 'text-amber-600'
      : tone === 'good'
      ? 'text-emerald-700'
      : 'text-slate-700'
  return (
    <div className="text-right leading-tight">
      <div className="text-[9px] tracking-widest font-semibold uppercase text-white/50">{label}</div>
      <div className={`font-mono font-semibold text-xs ${tone === 'neutral' ? 'text-slate-100' : toneClass}`}>{value}</div>
    </div>
  )
}

/**
 * Masthead: single-row official system bar. The previous "SAMADHAAN" hero
 * title and the raw "WebSocket (live push)" transport badge have been
 * removed per operator request -- a small connection dot (no protocol
 * jargon) is kept in this row instead, since operators still need to see
 * at a glance whether telemetry is flowing.
 */
export default function AdminHeader({
  connected,
  latencyMs,
  heartbeatLossPct,
  batteryPct,
  batterySensingOk,
  alarmActive,
  acknowledged,
  onAcknowledge,
}) {
  const now = useClock()
  const [tzMode, setTzMode] = useState('IST')
  const [escalating, setEscalating] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const escalate = async () => {
    setEscalating(true)
    try {
      await fetch(`http://${window.location.hostname}:8000/api/v1/escalate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ by: 'control-room' }),
      })
      setEscalated(true); setTimeout(() => setEscalated(false), 6000)
    } catch (e) {
      alert('Could not reach the backend to record the escalation. Check the backend is running.')
    } finally {
      setEscalating(false)
    }
  }

  const displayed =
    tzMode === 'IST'
      ? new Date(now.getTime() + (5.5 * 60 - now.getTimezoneOffset()) * 60000).toTimeString().split(' ')[0] + ' IST'
      : now.toUTCString().split(' ')[4] + ' UTC'

  const latencyTone = latencyMs == null ? 'neutral' : latencyMs > 4000 ? 'danger' : latencyMs > 1500 ? 'warn' : 'good'
  const lossTone =
    heartbeatLossPct == null ? 'neutral' : heartbeatLossPct > 10 ? 'danger' : heartbeatLossPct > 2 ? 'warn' : 'good'
  const batteryDisplay = batterySensingOk && batteryPct != null && batteryPct >= 0 ? `${batteryPct}%` : 'N/A (USB)'
  const batteryTone = !batterySensingOk ? 'neutral' : batteryPct < 20 ? 'danger' : batteryPct < 45 ? 'warn' : 'good'

  return (
    <header className="text-white sticky top-0 z-50 shadow-md bg-gradient-to-r from-[#0A2540] via-[#1A365D] to-[#0A2540]">
      <div className="max-w-[1800px] mx-auto px-6 py-2.5 flex items-center justify-between border-b border-white/10 flex-wrap gap-y-2">
        <div className="flex items-center gap-3 text-xs">
          <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[9px] font-bold">
            GOI
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">Ministry of Coal &mdash; Coal India Limited</div>
            <div className="text-white/55 text-[11px]">Directorate of Mine Safety &amp; Structural Monitoring &middot; AI-Enabled Subsidence Early Warning &middot; PS 26025</div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <AnimatePresence mode="wait">
              <motion.span
                key={connected ? 'up' : 'down'}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`}
              />
            </AnimatePresence>
            <span className="text-[11px] text-white/70">{connected ? 'Telemetry live' : 'Reconnecting'}</span>
          </div>

          <button
            onClick={() => setTzMode((m) => (m === 'IST' ? 'UTC' : 'IST'))}
            className="text-right leading-tight group"
            title="Toggle IST / UTC"
          >
            <div className="text-[9px] tracking-widest font-semibold uppercase text-white/50 group-hover:text-white/80">
              System Time &middot; tap to toggle
            </div>
            <div className="font-mono font-semibold text-xs">{displayed}</div>
          </button>

          <StatChip label="Latency" value={latencyMs != null ? `${Math.round(latencyMs)} ms` : '--'} tone={latencyTone} />
          <StatChip
            label="Packet Loss"
            value={heartbeatLossPct != null ? `${heartbeatLossPct.toFixed(1)}%` : '--'}
            tone={lossTone}
          />
          <StatChip label="Edge Battery" value={batteryDisplay} tone={batteryTone} />

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={onAcknowledge}
            disabled={!alarmActive || acknowledged}
            className={`px-3 py-1.5 rounded text-[11px] font-semibold tracking-wide border transition-colors ${
              alarmActive && !acknowledged
                ? 'bg-red-600 hover:bg-red-500 border-red-300 animate-pulse-border'
                : 'bg-white/10 border-white/15 text-white/50 cursor-not-allowed'
            }`}
          >
            {acknowledged || !alarmActive ? 'Alert Muted' : 'Acknowledge Alert'}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={escalate}
            disabled={escalating}
            className="bg-red-700 hover:bg-red-600 transition-colors px-4 py-1.5 rounded text-xs font-semibold tracking-wide disabled:opacity-50"
          >
            {escalating ? 'Recording…' : escalated ? 'Escalation recorded' : 'Emergency Escalation'}
          </motion.button>
        </div>
      </div>
      {escalated && (
        <div className="bg-red-800/90 text-white text-[11px] text-center py-1">
          Escalation logged and broadcast to every connected console. No SMS/email provider is configured in this deployment, so no external message was sent.
        </div>
      )}
    </header>
  )
}
