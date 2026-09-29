import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { speak } from '../utils/audioAlerts'

const ANNOUNCEMENT =
  'Attention all underground personnel. Ground movement has crossed critical threshold at Node 01. Evacuate the affected sector immediately and proceed to the designated assembly point.'

/**
 * Broadcasts an evacuation announcement toward personnel working
 * underground when the composite risk crosses the critical threshold.
 *
 * HONESTY NOTE (also shown in the panel itself): this prototype has no
 * physical connection to real underground PA speakers, cap-lamp text
 * alerts, or SMS gateways for miners' handheld devices. What you see here
 * is the control-room side of that workflow -- the alert content, timing,
 * and broadcast log a real system would send downstream. Wiring this to
 * actual underground annunciator hardware is listed as future-scope.
 */
export default function PersonnelAlertPanel({ severity, riskScore, nodeId = 'NODE-01' }) {
  const [log, setLog] = useState([])
  const [manualActive, setManualActive] = useState(false)
  const lastBroadcastRef = useRef(0)

  const broadcasting = severity === 'DANGER' || manualActive

  useEffect(() => {
    if (!broadcasting) return undefined
    const announce = () => {
      const now = Date.now()
      if (now - lastBroadcastRef.current < 7500) return
      lastBroadcastRef.current = now
      speak(ANNOUNCEMENT)
      setLog((l) => [...l.slice(-6), { time: new Date().toLocaleTimeString(), text: ANNOUNCEMENT }])
    }
    announce()
    const interval = setInterval(announce, 8000)
    return () => clearInterval(interval)
  }, [broadcasting])

  return (
    <div className="bg-white border border-slate-200 border-t-4 border-t-red-400 rounded">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm">Underground Personnel Alert</h2>
          <p className="text-xs text-slate-500">Broadcast evacuation announcement to workers in the affected sector</p>
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={broadcasting ? 'on' : 'off'}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
              broadcasting ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${broadcasting ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`} />
            {broadcasting ? 'Broadcasting' : 'Idle'}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="p-4 space-y-3">
        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5 leading-relaxed">
          {broadcasting ? `"${ANNOUNCEMENT}"` : 'No active alert. Announcement will begin automatically if risk reaches Critical Alert level.'}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setManualActive((v) => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded border transition-colors ${
              manualActive
                ? 'bg-slate-700 text-white border-slate-700 hover:bg-slate-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {manualActive ? 'Stop Test Broadcast' : 'Test Broadcast'}
          </motion.button>
          <span className="text-[10px] text-slate-400">Node: {nodeId} &middot; Current risk: {riskScore}/100</span>
        </div>

        <div className="text-[10px] text-slate-400 leading-snug max-h-20 overflow-y-auto border-t border-slate-100 pt-2">
          {log.length === 0 && <p>No broadcasts logged this session.</p>}
          {log
            .slice()
            .reverse()
            .map((entry, i) => (
              <div key={i} className="mb-1">
                <span className="font-mono">{entry.time}</span> &mdash; announcement sent
              </div>
            ))}
        </div>

        <p className="text-[9px] text-slate-400 italic border-t border-slate-100 pt-2">
          Prototype scope: this panel shows the control-room side of the alert (content, timing, log). It is not
          yet wired to physical underground PA speakers or cap-lamp text alerts &mdash; that hardware integration
          is future scope.
        </p>
      </div>
    </div>
  )
}
