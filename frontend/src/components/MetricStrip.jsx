import { motion, AnimatePresence } from 'framer-motion'

function MetricCard({ label, value, colorClass, accent }) {
  return (
    <div className={`bg-white border border-slate-200 shadow-sm rounded p-3 ${accent || ''}`}>
      <div className="text-[10px] tracking-widest font-semibold uppercase text-slateink">{label}</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={value}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2 }}
          className={`text-2xl font-bold font-mono ${colorClass || 'text-slate-800'}`}
        >
          {value}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default function MetricStrip({ latest }) {
  const risk = latest?.risk_score ?? '--'
  const riskColor =
    typeof risk === 'number'
      ? risk >= 85
        ? 'text-red-600'
        : risk >= 60
        ? 'text-amber-600'
        : 'text-emerald-700'
      : 'text-slate-800'

  const tilt = latest
    ? Math.max(Math.abs(latest.pitch_dev || 0), Math.abs(latest.roll_dev || 0)).toFixed(1) + '\u00b0'
    : '--'
  const sound = latest?.sound !== undefined ? latest.sound.toFixed(0) : '--'
  const linkMode = latest?.link_mode || '--'
  const rssi = linkMode === 'WiFi' && latest?.rssi ? `${latest.rssi} dBm` : linkMode === 'USB-Serial' ? 'N/A (USB)' : '--'
  const heartbeat = latest?.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : '--'

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <MetricCard label="Risk Score" value={risk} colorClass={riskColor} accent="border-l-4 border-l-red-400" />
      <MetricCard label="Tilt Deviation" value={tilt} accent="border-l-4 border-l-amber-400" />
      <MetricCard label="Acoustic Level" value={sound} accent="border-l-4 border-l-sky-400" />
      <MetricCard label="Link Mode" value={linkMode} accent="border-l-4 border-l-emerald-400" />
      <MetricCard label="Last Heartbeat" value={heartbeat} accent="border-l-4 border-l-violet-400" />
    </div>
  )
}
