import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchAISummary } from '../hooks/useTelemetry'

const BADGE_STYLES = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-amber-100 text-amber-700',
  MODERATE: 'bg-yellow-50 text-yellow-700',
  LOW: 'bg-emerald-100 text-emerald-700',
}

export default function AIRiskSummary({ refreshKey }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    fetchAISummary()
      .then((s) => {
        if (s.risk_level) setSummary(s)
      })
      .catch(() => {})
  }, [refreshKey])

  return (
    <div className="bg-white border border-slate-200 border-t-4 border-t-indigo-500 shadow-sm rounded xl:col-span-2">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm text-slate-800">AI Risk Intelligence Summary</h2>
          <p className="text-xs text-slateink">Generated from live telemetry &mdash; rule-based engine (LLM-swappable, see backend)</p>
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={summary?.risk_level || 'none'}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className={`text-xs font-bold px-3 py-1 rounded-full ${BADGE_STYLES[summary?.risk_level] || 'bg-slate-100 text-slate-500'}`}
          >
            {summary?.risk_level || '--'}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="p-4 grid grid-cols-3 gap-3 border-b border-slate-100">
        <div>
          <div className="text-[10px] tracking-widest font-semibold uppercase text-slateink">Failure Window Estimate</div>
          <div className="text-sm font-semibold mt-1 text-slate-800">{summary?.failure_window_estimate || '--'}</div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest font-semibold uppercase text-slateink">Structural Stability Index</div>
          <div className="text-sm font-semibold mt-1 text-slate-800">{summary?.structural_stability_index || '--'}</div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest font-semibold uppercase text-slateink">Generated</div>
          <div className="text-sm font-semibold mt-1 font-mono">
            {summary ? new Date(summary.generated_at).toLocaleTimeString() : '--'}
          </div>
        </div>
      </div>
      <div className="p-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={summary?.narrative || 'waiting'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm leading-relaxed text-slate-700"
          >
            {summary?.narrative || 'Awaiting first telemetry reading...'}
          </motion.p>
        </AnimatePresence>
        {summary && (
          <>
            <p className="text-sm font-medium text-navy mt-3">Recommendation: {summary.recommendation}</p>
            <p className="text-[11px] text-slate-400 mt-3 italic">{summary.note}</p>
          </>
        )}
      </div>
    </div>
  )
}
