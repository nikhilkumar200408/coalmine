import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const STYLES = {
  tilt: { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-800', icon: '\u25B3', label: 'Tilt-rate anomaly' },
  acoustic: { border: 'border-sky-300', bg: 'bg-sky-50', text: 'text-sky-800', icon: '\u266B', label: 'Acoustic spike' },
  danger: { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-800', icon: '\u26A0', label: 'Threshold breach' },
}

function Toast({ toast, onDismiss }) {
  const style = STYLES[toast.kind] || STYLES.tilt

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 6000)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className={`pointer-events-auto w-72 rounded border ${style.border} ${style.bg} px-3 py-2.5 shadow-md`}
    >
      <div className="flex items-start gap-2">
        <span className={`text-base leading-none mt-0.5 ${style.text}`}>{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${style.text}`}>{style.label}</span>
            <button onClick={() => onDismiss(toast.id)} className="text-slate-400 hover:text-slate-700 text-xs leading-none">
              &times;
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-0.5 leading-snug">{toast.message}</p>
          <p className="text-[10px] text-slate-400 font-mono mt-1">{toast.time}</p>
        </div>
      </div>
    </motion.div>
  )
}

export default function ToastAlerts({ toasts, onDismiss }) {
  return (
    <div className="fixed top-24 right-4 z-[1200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}
