import { useEffect, useState } from 'react'
import { motion, useSpring } from 'framer-motion'

const CX = 100
const CY = 100
const R = 78
const NEEDLE_LEN = 62

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArcFlag = Math.abs(startAngle - endAngle) <= 180 ? 0 : 1
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

// value 0-100 -> angle 180 (left, low risk) down to 0 (right, high risk)
function valueToAngle(v) {
  return 180 - Math.max(0, Math.min(100, v)) * 1.8
}

function colorForRisk(v) {
  if (v >= 85) return '#ef4444'
  if (v >= 60) return '#f59e0b'
  return '#22c55e'
}

export default function RiskGauge({ value = 0, size = 190 }) {
  const spring = useSpring(0, { stiffness: 55, damping: 16 })
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    spring.set(value)
  }, [value, spring])

  useEffect(() => {
    const unsub = spring.on('change', (v) => setDisplayValue(v))
    return () => unsub()
  }, [spring])

  const rounded = Math.round(displayValue)
  const color = colorForRisk(rounded)
  const needleAngle = valueToAngle(displayValue)
  const needleTip = polarToCartesian(CX, CY, NEEDLE_LEN, needleAngle)

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 200 118" style={{ width: size, height: size * 0.62 }}>
        {/* background track */}
        <path d={describeArc(CX, CY, R, 180, 0)} stroke="#e2e8f0" strokeWidth="14" fill="none" strokeLinecap="round" />
        {/* color zones */}
        <path d={describeArc(CX, CY, R, 180, 72)} stroke="#166534" strokeOpacity="0.9" strokeWidth="14" fill="none" />
        <path d={describeArc(CX, CY, R, 72, 27)} stroke="#92400e" strokeOpacity="0.9" strokeWidth="14" fill="none" />
        <path d={describeArc(CX, CY, R, 27, 0)} stroke="#991b1b" strokeOpacity="0.9" strokeWidth="14" fill="none" />
        {/* tick labels */}
        {[0, 25, 50, 75, 100].map((t) => {
          const p = polarToCartesian(CX, CY, R + 16, valueToAngle(t))
          return (
            <text key={t} x={p.x} y={p.y} fontSize="8" fill="#64748b" textAnchor="middle" fontFamily="Roboto Mono, monospace">
              {t}
            </text>
          )
        })}
        {/* needle */}
        <motion.line
          x1={CX}
          y1={CY}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        <circle cx={CX} cy={CY} r="6" fill={color} stroke="#ffffff" strokeWidth="2" />
      </svg>

      <div className="flex flex-col items-center -mt-2">
        <span className="text-3xl font-bold font-mono tabular-nums" style={{ color }}>
          {rounded}
        </span>
        <span className="text-[9px] text-slateink tracking-widest uppercase">Composite Risk Index</span>
      </div>
    </div>
  )
}
