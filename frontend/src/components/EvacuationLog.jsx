import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchEvacuationLog } from '../hooks/useTelemetry'

const TAG_STYLE = {
  CRITICAL: 'text-red-400',
  WARN: 'text-amber-400',
  INFO: 'text-emerald-400',
}

function msTimestamp(iso) {
  const d = new Date(iso)
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

/**
 * Live terminal-style event stream. Backend evacuation-trigger log entries
 * (real threshold crossings, from /api/v1/evacuation-log) are merged with
 * client-observed system events passed in via `liveEvents` (connection
 * state changes, tilt/acoustic alerts already surfaced as toasts) into a
 * single chronological hacker-terminal feed.
 */
export default function EvacuationLog({ refreshKey, liveEvents = [] }) {
  const [log, setLog] = useState([])
  const scrollRef = useRef(null)

  useEffect(() => {
    fetchEvacuationLog()
      .then(setLog)
      .catch(() => {})
  }, [refreshKey])

  const merged = useMemo(() => {
    const fromLog = log.map((e) => ({
      timestamp: e.timestamp,
      severity: 'CRITICAL',
      message: `EVACUATION THRESHOLD TRIGGERED \u2014 ${e.node_id} risk ${e.risk_score}% (threshold ${e.threshold}%)`,
    }))
    return [...fromLog, ...liveEvents]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-40)
  }, [log, liveEvents])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [merged.length])

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm text-slate-800">Live Terminal Event Stream</h2>
          <p className="text-[11px] text-slate-500">Evacuation triggers &amp; system events, real-time</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-500 font-mono border border-slate-200">
          THRESHOLD 85%
        </span>
      </div>
      <div
        ref={scrollRef}
        className="terminal-feed p-3 h-[220px] overflow-y-auto text-[11px] leading-relaxed"
      >
        {!merged.length && <p className="text-slate-600">&gt; awaiting first event...</p>}
        <AnimatePresence initial={false}>
          {merged.map((e, i) => (
            <motion.div
              key={`${e.timestamp}-${i}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="whitespace-pre-wrap break-words"
            >
              <span className="text-slate-600">[{msTimestamp(e.timestamp)}]</span>{' '}
              <span className={`font-bold ${TAG_STYLE[e.severity] || 'text-slate-400'}`}>[{e.severity}]</span>{' '}
              <span className="text-slate-300">{e.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div className="text-emerald-400 terminal-caret mt-1">&gt;</div>
      </div>
    </div>
  )
}
