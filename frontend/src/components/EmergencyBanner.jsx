import { motion, AnimatePresence } from 'framer-motion'
import { severityMeta } from '../utils/severity'

/**
 * Professional advisory-style banner (light theme). Wording follows an
 * official hazard-advisory register (Nominal / Advisory / Critical Alert)
 * rather than a game-style "DANGER" flash.
 */
export default function EmergencyBanner({ severity, riskScore, nodeId = 'NODE-01' }) {
  if (severity === 'SAFE') return null
  const meta = severityMeta(severity)
  const isCritical = severity === 'DANGER'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className={`rounded border overflow-hidden ${isCritical ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <motion.span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: meta.color }}
            animate={isCritical ? { scale: [1, 1.3, 1] } : { opacity: [1, 0.5, 1] }}
            transition={{ duration: isCritical ? 0.8 : 1.6, repeat: Infinity }}
          />
          <span className="text-sm font-semibold" style={{ color: meta.color }}>
            {meta.short}
          </span>
          <span className="text-xs text-slate-600">
            {nodeId} reporting composite risk {riskScore}/100 &mdash;{' '}
            {isCritical
              ? 'immediate field verification and evacuation advisory recommended'
              : 'elevated ground movement, increased monitoring in effect'}
            .
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
