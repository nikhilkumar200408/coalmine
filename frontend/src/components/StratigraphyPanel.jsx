import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const LAYERS = [
  { name: 'Topsoil', depthLabel: '0 m', color: '#a16207', pattern: 'dots', textureColor: '#fef3c7' },
  { name: 'Sandstone', depthLabel: '5 m', color: '#d97706', pattern: 'stipple', textureColor: '#fde68a' },
  { name: 'Shale', depthLabel: '10 m', color: '#64748b', pattern: 'lines', textureColor: '#e2e8f0' },
  { name: 'Coal Seam', depthLabel: '15 m', color: '#1e293b', pattern: 'diag', textureColor: '#334155' },
]

/**
 * Illustrative stratigraphy cross-section. The layer depths/materials are
 * a REPRESENTATIVE Indian coalfield sequence (topsoil -> sandstone -> shale
 * -> coal seam), not a surveyed borehole log for this specific site --
 * stated in the footnote. Displacement arrows are directional projections
 * from the live pitch_dev/roll_dev of the single physical sensor node.
 */
export default function StratigraphyPanel({ pitchDev = 0, rollDev = 0, riskScore = 0 }) {
  const magnitude = Math.min(1, Math.sqrt(pitchDev * pitchDev + rollDev * rollDev) / 40)
  const direction = pitchDev >= 0 ? 1 : -1
  const [scanY, setScanY] = useState(0)

  useEffect(() => {
    let raf
    let start
    const duration = 4200
    const animate = (ts) => {
      if (!start) start = ts
      const progress = ((ts - start) % duration) / duration
      setScanY(progress)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [])

  const totalHeight = 100
  const layerHeight = totalHeight / LAYERS.length

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="flex-1 relative overflow-hidden">
        <svg viewBox="0 0 400 260" className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <pattern id="dotsPattern" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.9" fill="#92400e" opacity="0.4" />
            </pattern>
            <pattern id="stipplePattern" width="10" height="6" patternUnits="userSpaceOnUse">
              <rect width="10" height="6" fill="#f59e0b" opacity="0.12" />
              <circle cx="3" cy="3" r="0.6" fill="#b45309" opacity="0.5" />
              <circle cx="7" cy="1" r="0.5" fill="#b45309" opacity="0.4" />
            </pattern>
            <pattern id="linesPattern" width="12" height="5" patternUnits="userSpaceOnUse">
              <line x1="0" y1="2.5" x2="12" y2="2.5" stroke="#475569" strokeWidth="0.7" opacity="0.35" />
            </pattern>
            <pattern id="diagPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#0ea5e9" strokeWidth="1" opacity="0.35" />
            </pattern>
            <linearGradient id="layerShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {LAYERS.map((layer, i) => {
            const y = i * (260 / LAYERS.length)
            const h = 260 / LAYERS.length
            const patternId =
              layer.pattern === 'dots'
                ? 'dotsPattern'
                : layer.pattern === 'stipple'
                ? 'stipplePattern'
                : layer.pattern === 'lines'
                ? 'linesPattern'
                : 'diagPattern'

            const arrowY = y + h / 2
            const arrowLen = 14 + magnitude * 30
            const arrowX = 260

            return (
              <g key={layer.name}>
                <rect x="0" y={y} width="400" height={h} fill={layer.color} opacity="0.85" />
                <rect x="0" y={y} width="400" height={h} fill={`url(#${patternId})`} />
                <rect x="0" y={y} width="400" height={h} fill="url(#layerShade)" />

                {/* jagged rock-boundary line between strata instead of a flat cut */}
                {i > 0 && (
                  <path
                    d={`M 0 ${y} ${Array.from({ length: 8 })
                      .map((_, k) => `L ${(k + 1) * 50} ${y + Math.sin(k * 1.7 + i) * 2.5}`)
                      .join(' ')}`}
                    stroke="#0f172a"
                    strokeWidth="1"
                    fill="none"
                    opacity="0.25"
                  />
                )}

                <text x="16" y={y + 18} fontSize="9" fill="#0f172a" fontFamily="Roboto Mono, monospace" opacity="0.7">
                  {layer.depthLabel}
                </text>
                <text x="40" y={arrowY + 4} fontSize="15" fontWeight="700" fill="#ffffff" fontFamily="Inter, sans-serif">
                  {layer.name}
                </text>

                {/* live displacement vector, direction/length driven by real pitch/roll */}
                <motion.line
                  x1={arrowX}
                  y1={arrowY}
                  x2={arrowX + arrowLen * direction}
                  y2={arrowY}
                  stroke="#0ea5e9"
                  strokeWidth="2.5"
                  animate={{ x2: arrowX + arrowLen * direction }}
                  transition={{ type: 'spring', stiffness: 60, damping: 14 }}
                />
                <motion.polygon
                  points={`0,-4 0,4 8,0`}
                  fill="#0ea5e9"
                  animate={{
                    x: arrowX + arrowLen * direction - (direction > 0 ? 0 : 8),
                    y: arrowY,
                    rotate: direction > 0 ? 0 : 180,
                  }}
                  transition={{ type: 'spring', stiffness: 60, damping: 14 }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              </g>
            )
          })}

          {/* animated scanning line sweeping down, "measuring" the section live */}
          <motion.line x1="0" x2="400" stroke="#22d3ee" strokeWidth="1.5" opacity="0.7" y1={scanY * 260} y2={scanY * 260} />
          <motion.rect x="0" width="400" height="2" fill="#22d3ee" opacity="0.35" y={scanY * 260 - 1} />
        </svg>

        <div className="absolute top-2 right-2 bg-white/90 border border-slate-200 rounded px-2 py-1 text-[9px] font-mono text-slate-500 shadow-sm">
          |v| &asymp; {(magnitude * 40).toFixed(2)}&deg; &middot; &theta; {(pitchDev).toFixed(1)}&deg;
        </div>
      </div>
      <div className="px-3 py-2 border-t border-slate-200 text-[9px] text-slate-400 bg-white">
        Directional displacement vectors derived live from pitch_dev / roll_dev &mdash; illustrative per-layer
        projection over a representative Indian-coalfield stratigraphy sequence, not a surveyed borehole log for
        this specific site.
      </div>
    </div>
  )
}
