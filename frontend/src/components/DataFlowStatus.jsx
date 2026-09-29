import { motion, AnimatePresence } from 'framer-motion'

/**
 * Replaces the old battery-dependent "Node Health" gauge. Since the
 * current hardware runs on USB power only (no battery joined yet, so
 * battery % is meaningless right now), this instead visualizes something
 * genuinely true of the current setup: HOW the data is getting from the
 * sensor node to this dashboard -- over the USB cable via serial_bridge.py,
 * or over WiFi once the battery is wired in and ENABLE_WIFI is flipped on
 * in the firmware.
 */
export default function DataFlowStatus({ linkMode, connected, packetLossPct, rssi }) {
  const isUSB = linkMode === 'USB-Serial'
  const isWiFi = linkMode === 'WiFi'

  const pathColor = connected ? '#22c55e' : '#475569'

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        {/* Sensor node */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-full bg-navy border border-slate-300 flex items-center justify-center text-white text-[9px] font-bold">N1</div>
          <span className="text-[9px] text-slate-400">Node</span>
        </div>

        {/* Animated connecting line with a moving dot representing live packets */}
        <svg width="70" height="16" className="overflow-visible">
          <line x1="0" y1="8" x2="70" y2="8" stroke={pathColor} strokeWidth="1.5" strokeDasharray={isUSB ? '3 3' : '0'} />
          {connected && (
            <motion.circle
              cy="8"
              r="3"
              fill={pathColor}
              animate={{ cx: [0, 70] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </svg>

        {/* Transport mode badge */}
        <div className="flex flex-col items-center gap-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={linkMode}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] ${
                isUSB ? 'bg-slate-700' : isWiFi ? 'bg-sky-700' : 'bg-slate-800'
              }`}
            >
              {isUSB ? '🔌' : isWiFi ? '📶' : '?'}
            </motion.div>
          </AnimatePresence>
          <span className="text-[9px] text-slate-400">{isUSB ? 'USB cable' : isWiFi ? 'WiFi' : 'Link'}</span>
        </div>

        {/* Connecting line to dashboard */}
        <svg width="70" height="16" className="overflow-visible">
          <line x1="0" y1="8" x2="70" y2="8" stroke={pathColor} strokeWidth="1.5" />
          {connected && (
            <motion.circle
              cy="8"
              r="3"
              fill={pathColor}
              animate={{ cx: [0, 70] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear', delay: 0.55 }}
            />
          )}
        </svg>

        {/* Dashboard */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center text-white text-[13px]">📊</div>
          <span className="text-[9px] text-slate-400">Dashboard</span>
        </div>
      </div>

      <div className="text-[11px] leading-tight border-l border-slate-200 pl-4">
        <div className="font-semibold text-slate-700">
          {isUSB ? 'Streaming over USB (no WiFi on node)' : isWiFi ? 'Streaming over WiFi' : 'Awaiting first packet'}
        </div>
        <div className="text-slate-400">
          {isWiFi && rssi ? `Signal: ${rssi} dBm` : ''}
          {packetLossPct !== null ? `${isWiFi ? ' \u00b7 ' : ''}Est. loss: ${packetLossPct.toFixed(1)}%` : ''}
        </div>
      </div>
    </div>
  )
}
