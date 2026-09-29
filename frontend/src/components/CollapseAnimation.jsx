import { useEffect, useMemo, useState } from 'react'
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { severityFromRisk, severityMeta } from '../utils/severity'

function DebrisChunk({ originX, groundY }) {
  const size = 4 + Math.random() * 7
  const fallDistance = 60 + Math.random() * 50
  const duration = 0.9 + Math.random() * 0.6
  const rotateTo = (Math.random() - 0.5) * 360
  const drift = (Math.random() - 0.5) * 30

  return (
    <motion.rect
      x={originX}
      y={groundY}
      width={size}
      height={size}
      fill="#6B5B4D"
      initial={{ opacity: 1, y: groundY }}
      animate={{ y: groundY + fallDistance, x: originX + drift, rotate: rotateTo, opacity: [1, 1, 0] }}
      transition={{ duration, ease: [0.36, 0, 0.66, -0.02] }}
    />
  )
}

function DustPuff({ x, y }) {
  const scale = 1.2 + Math.random() * 1.3
  const duration = 1.4 + Math.random() * 0.8
  return (
    <motion.circle
      cx={x}
      cy={y}
      r={4}
      fill="#94a3b8"
      initial={{ opacity: 0.5, scale: 0.4 }}
      animate={{ opacity: 0, scale }}
      transition={{ duration, ease: 'easeOut' }}
    />
  )
}

/**
 * Live, physically-animated cross-section of the monitored ground panel.
 * Even at nominal (SAFE) risk, this now shows continuous ambient telemetry
 * -- a faint live micro-tremor trace, depth markers, and readout labels --
 * so the panel always reads as an active instrument rather than a blank
 * placeholder waiting for something to happen.
 */
export default function CollapseAnimation({ pitchDev = 0, rollDev = 0, riskScore = 0, soundLevel = 0 }) {
  const severity = severityFromRisk(riskScore)
  const sevMeta = severityMeta(severity)

  const tiltSpring = useSpring(0, { stiffness: 40, damping: 12, mass: 1 })
  const sinkSpring = useSpring(0, { stiffness: 30, damping: 14, mass: 1.2 })
  const riskSpring = useSpring(0, { stiffness: 50, damping: 16 })

  useEffect(() => {
    tiltSpring.set(Math.max(-12, Math.min(12, rollDev * 0.4)))
  }, [rollDev, tiltSpring])
  useEffect(() => {
    sinkSpring.set(Math.min(40, (riskScore / 100) * 40))
  }, [riskScore, sinkSpring])
  useEffect(() => {
    riskSpring.set(riskScore)
  }, [riskScore, riskSpring])

  const surfaceY = useTransform(sinkSpring, (v) => 70 + v)
  const rotateDeg = tiltSpring

  const crackThresholds = [15, 30, 45, 60, 75]
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const crackPathLengths = crackThresholds.map((t) => useTransform(riskSpring, [t, t + 25], [0, 1], { clamp: true }))

  const [debris, setDebris] = useState([])
  const [dust, setDust] = useState([])

  useEffect(() => {
    if (riskScore < 55) return undefined
    const spawnRate = riskScore >= 85 ? 260 : 550
    const interval = setInterval(() => {
      const id = Math.random().toString(36).slice(2)
      const originX = 90 + Math.random() * 220
      setDebris((d) => [...d.slice(-9), { id, originX }])
      if (riskScore >= 85) {
        const dustId = Math.random().toString(36).slice(2)
        setDust((d) => [...d.slice(-5), { id: dustId, x: originX, y: 95 }])
      }
    }, spawnRate)
    return () => clearInterval(interval)
  }, [riskScore])

  useEffect(() => {
    if (!debris.length) return undefined
    const t = setTimeout(() => setDebris((d) => d.slice(1)), 1600)
    return () => clearTimeout(t)
  }, [debris])
  useEffect(() => {
    if (!dust.length) return undefined
    const t = setTimeout(() => setDust((d) => d.slice(1)), 2400)
    return () => clearTimeout(t)
  }, [dust])

  const shakeX = useSpring(0, { stiffness: 800, damping: 12 })
  const shakeY = useSpring(0, { stiffness: 800, damping: 12 })
  useEffect(() => {
    if (severity !== 'DANGER') {
      shakeX.set(0)
      shakeY.set(0)
      return undefined
    }
    const interval = setInterval(() => {
      shakeX.set((Math.random() - 0.5) * 4)
      shakeY.set((Math.random() - 0.5) * 3)
    }, 90)
    return () => clearInterval(interval)
  }, [severity, shakeX, shakeY])

  const groundFill = useMemo(() => {
    if (severity === 'DANGER') return { top: '#f3d0d0', bottom: '#e0a3a3' }
    if (severity === 'CAUTION') return { top: '#f6e3c4', bottom: '#e8c793' }
    return { top: '#e7ecf1', bottom: '#c8d3de' }
  }, [severity])

  // Live micro-tremor trace: always present, even at SAFE, so the panel
  // never looks idle/blank -- ambient sensor noise + risk-scaled amplitude.
  const [tremor, setTremor] = useState(Array(60).fill(0))
  useEffect(() => {
    const interval = setInterval(() => {
      setTremor((prev) => {
        const amplitude = 1 + (riskScore / 100) * 6 + Math.min(soundLevel / 40, 4)
        const next = prev.slice(1)
        next.push((Math.random() - 0.5) * amplitude)
        return next
      })
    }, 120)
    return () => clearInterval(interval)
  }, [riskScore, soundLevel])

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-50">
      <motion.svg viewBox="0 0 400 260" className="w-full h-full" style={{ x: shakeX, y: shakeY }}>
        <defs>
          <linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={groundFill.top} />
            <stop offset="100%" stopColor={groundFill.bottom} />
          </linearGradient>
          <pattern id="skyGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
          </pattern>
        </defs>

        <rect x="0" y="0" width="400" height="260" fill="#f8fafc" />
        <rect x="0" y="0" width="400" height="70" fill="url(#skyGrid)" />

        {/* Depth markers, always visible -- gives the panel a permanent
            "instrument" feel instead of empty space above ground. */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line x1="4" y1={16 + i * 18} x2="10" y2={16 + i * 18} stroke="#94a3b8" strokeWidth="1" />
            <text x="13" y={19 + i * 18} fontSize="6" fill="#94a3b8" fontFamily="Roboto Mono, monospace">
              {i * 2}m
            </text>
          </g>
        ))}

        {/* Live ambient micro-tremor trace -- always animating */}
        <g transform="translate(0, 14)">
          <polyline
            points={tremor.map((v, i) => `${i * 6.6},${20 + v * 3}`).join(' ')}
            fill="none"
            stroke={sevMeta.color}
            strokeWidth="1"
            opacity="0.7"
          />
          <text x="330" y="10" fontSize="7" fill="#64748b" fontFamily="Roboto Mono, monospace">
            live micro-tremor
          </text>
        </g>

        <motion.g style={{ rotate: rotateDeg, originX: '200px', originY: '90px' }}>
          <motion.rect x={-20} y={surfaceY} width={440} height={180} fill="url(#soilGrad)" />
          <motion.rect x={-20} y={surfaceY} width={440} height={3} fill={sevMeta.color} />

          <motion.rect
            x={150}
            y={useTransform(surfaceY, (v) => v + 90)}
            width={100}
            height={40}
            rx={4}
            fill="#4A5568"
            opacity={0.55}
          />
          <motion.text
            x={200}
            style={{ y: useTransform(surfaceY, (v) => v + 115) }}
            fontSize="9"
            fill="#fff"
            textAnchor="middle"
            fontFamily="monospace"
          >
            MINE PANEL
          </motion.text>

          {crackThresholds.map((t, i) => {
            const cx = 55 + i * 62 + Math.sin(i * 13) * 8
            const depth = 26 + i * 5
            return (
              <motion.path
                key={t}
                d={`M ${cx} 0 L ${cx + 6} ${depth * 0.5} L ${cx - 4} ${depth}`}
                stroke="#7A1F1F"
                strokeWidth={1.6}
                fill="none"
                style={{ pathLength: crackPathLengths[i], translateY: surfaceY }}
                opacity={0.85}
              />
            )
          })}

          <AnimatePresence>
            {debris.map((d) => (
              <DebrisChunk key={d.id} originX={d.originX} groundY={95} />
            ))}
            {dust.map((d) => (
              <DustPuff key={d.id} x={d.x} y={d.y} />
            ))}
          </AnimatePresence>
        </motion.g>

        {severity !== 'SAFE' && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx={200}
                cy={20}
                r={5}
                fill="none"
                stroke={sevMeta.color}
                strokeWidth={1.2}
                initial={{ r: 5, opacity: 0.6 }}
                animate={{ r: severity === 'DANGER' ? 34 : 22, opacity: 0 }}
                transition={{
                  duration: severity === 'DANGER' ? 1.6 : 2.4,
                  repeat: Infinity,
                  delay: i * (severity === 'DANGER' ? 0.5 : 0.8),
                  ease: 'easeOut',
                }}
              />
            ))}
          </>
        )}
        <motion.circle
          cx={200}
          cy={20}
          r={5}
          fill={sevMeta.color}
          animate={severity === 'DANGER' ? { scale: [1, 1.4, 1] } : { scale: 1 }}
          transition={severity === 'DANGER' ? { duration: 0.6, repeat: Infinity } : {}}
        />
        <text x={212} y={24} fontSize="10" fill="#334155" fontFamily="Inter, sans-serif">
          SENSOR NODE-01
        </text>

        {/* Live readout overlay -- keeps the panel informative regardless of severity */}
        <g transform="translate(6, 250)">
          <text fontSize="7" fill="#64748b" fontFamily="Roboto Mono, monospace">
            pitch {pitchDev.toFixed(1)}&deg; &middot; roll {rollDev.toFixed(1)}&deg; &middot; acoustic {soundLevel.toFixed(0)}
          </text>
        </g>
      </motion.svg>

      <AnimatePresence>
        {severity !== 'SAFE' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-2 left-2 px-2 py-1 rounded text-[10px] font-bold tracking-wide text-white shadow-sm"
            style={{ backgroundColor: sevMeta.color }}
          >
            {sevMeta.short}
          </motion.div>
        )}
      </AnimatePresence>

      {severity !== 'SAFE' && (
        <div className="absolute bottom-1 right-2 text-[9px] text-slate-400 italic">
          Rings: illustrative estimated-influence radius, not surveyed
        </div>
      )}
    </div>
  )
}
