import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchProjection } from '../hooks/useTelemetry'

const HORIZONS = [6, 12, 24, 48]

/**
 * Rewritten to auto-fetch and refresh on its own (instead of only updating
 * when the user manually drags the slider, which previously left it
 * showing blank "--" until interacted with). All four horizons are now
 * computed and shown at once as a small trend row, with the slider used to
 * highlight one of them.
 */
export default function PredictiveSlider({ refreshKey }) {
  const [idx, setIdx] = useState(0)
  const [projections, setProjections] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = await fetchProjection()
      setProjections(p.projections)
    } catch {
      setProjections(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  const selectedHorizon = HORIZONS[idx]
  const selectedValue = projections ? projections[`${selectedHorizon}h`] : null

  const trend =
    projections && HORIZONS.every((h) => projections[`${h}h`] != null)
      ? HORIZONS.map((h) => projections[`${h}h`])
      : null
  const maxTrend = trend ? Math.max(...trend, 1) : 1

  return (
    <div className="bg-white border border-slate-200 border-t-4 border-t-purple-400 rounded xl:col-span-2">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm">Predictive Trend Projection</h2>
          <p className="text-xs text-slate-500">
            Linear extrapolation of recent deviation rate-of-change &mdash; a trend estimate, not a validated
            long-range geological forecast
          </p>
        </div>
        {loading && <span className="text-[10px] text-slate-400 animate-pulse">refreshing&hellip;</span>}
      </div>
      <div className="p-4">
        {trend ? (
          <div className="flex items-end gap-3 h-16 mb-3">
            {trend.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  className={`w-full rounded-t ${i === idx ? 'bg-purple-500' : 'bg-purple-200'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(6, (v / maxTrend) * 56)}px` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 16 }}
                  onClick={() => setIdx(i)}
                  role="button"
                />
                <span className="text-[9px] text-slate-400">+{HORIZONS[i]}h</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-16 flex items-center justify-center text-xs text-slate-400 mb-3">
            Awaiting enough telemetry history to project a trend&hellip;
          </div>
        )}

        <input
          type="range"
          min="0"
          max="3"
          step="1"
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          className="w-full accent-purple-500"
        />
        <div className="flex justify-between text-[11px] text-slate-400 mt-1 px-0.5">
          {HORIZONS.map((h) => (
            <span key={h}>+{h}h</span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedValue ?? 'none'}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-3xl font-bold font-mono"
            >
              {selectedValue == null ? '--' : `${selectedValue}\u00b0`}
            </motion.div>
          </AnimatePresence>
          <div className="text-xs text-slate-500 leading-tight">
            Projected max tilt deviation
            <br />
            at +{selectedHorizon}h horizon (degrees)
          </div>
        </div>
      </div>
    </div>
  )
}
