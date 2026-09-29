import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence, useSpring } from 'framer-motion'
import { severityMeta } from '../utils/severity'

const COLS = 5
const ROWS = 4
const TILE_W = 46
const TILE_H = 26
const PILLAR_HEIGHT = 22
const ORIGIN_X = 300
const ORIGIN_Y = 46

const ROW_LABELS = ['A', 'B', 'C', 'D']

function sectorId(row, col) {
  return `${ROW_LABELS[row]}${col + 1}`
}

// Isometric projection: (row, col) grid coordinate -> 2D screen point.
function isoPoint(row, col) {
  const x = ORIGIN_X + (col - row) * (TILE_W / 2)
  const y = ORIGIN_Y + (col + row) * (TILE_H / 2)
  return { x, y }
}

// A handful of fixed, deterministic "wireframe scan" polylines evoking a
// LIDAR/SLAM point-cloud survey aesthetic (as in the reference image this
// panel is modeled on). These are DECORATIVE ONLY -- illustrative styling,
// not real point-cloud or LIDAR survey data (this hardware has no LIDAR).
const SCAN_LINES = [
  { color: '#f43f5e', pts: '40,260 160,120 260,180 380,80 520,140' },
  { color: '#f59e0b', pts: '60,240 180,150 300,200 440,110 560,160' },
  { color: '#22c55e', pts: '30,150 150,220 280,140 400,210 540,120' },
  { color: '#38bdf8', pts: '80,280 200,190 320,240 460,150 580,200' },
  { color: '#a78bfa', pts: '50,190 170,260 290,170 420,240 550,180' },
]

/**
 * Room-and-Pillar underground gallery layout, rendered in an isometric
 * pseudo-3D projection (classic 2.5D isometric grid, not a WebGL/LIDAR
 * model -- there is no real geological or point-cloud survey data for
 * this mine). The faint colored crossing lines in the background are a
 * decorative "scan network" motif and are explicitly illustrative.
 *
 * Only ONE physical sensor node exists on the current hardware, so the
 * "active" / "predicted" sector below is an illustrative directional
 * projection derived from that single node's live pitch/roll deviation --
 * not a per-sector instrumented reading. Stated plainly in the caption.
 */
export default function MineShaftPanel({ pitchDev = 0, rollDev = 0, riskScore = 0, severity = 'SAFE' }) {
  const [selected, setSelected] = useState(null)
  const tiltSpring = useSpring(0, { stiffness: 30, damping: 14 })

  useEffect(() => {
    tiltSpring.set(Math.max(-4, Math.min(4, rollDev * 0.25)))
  }, [rollDev, tiltSpring])

  const totalSectors = ROWS * COLS

  const { activeIdx, predictedIdx, displacementRate } = useMemo(() => {
    const angle = Math.atan2(rollDev, pitchDev)
    const normalized = (angle + Math.PI) / (2 * Math.PI)
    const idx = Math.floor(normalized * totalSectors) % totalSectors
    const rate = Math.sqrt(pitchDev * pitchDev + rollDev * rollDev)
    return {
      activeIdx: severity === 'DANGER' ? idx : null,
      predictedIdx: severity !== 'SAFE' ? (idx + 1) % totalSectors : null,
      displacementRate: rate,
    }
  }, [pitchDev, rollDev, severity, totalSectors])

  const sectors = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      sectors.push({ row: r, col: c, idx: r * COLS + c, id: sectorId(r, c) })
    }
  }
  const selectedSector = sectors.find((s) => s.idx === selected)

  return (
    <div className="w-full h-full flex flex-col bg-slate-50">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <motion.svg
          viewBox="0 0 620 340"
          className="w-full h-full"
          style={{ rotate: tiltSpring, transformOrigin: '300px 170px' }}
        >
          <defs>
            <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.18" />
            </filter>
            <filter id="collapseGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#D32F2F" floodOpacity="0.85" />
            </filter>
          </defs>

          <rect x="0" y="0" width="100%" height="100%" fill="url(#floorGrad)" />

          {/* Decorative wireframe "scan network" -- illustrative styling
              motif only, inspired by point-cloud survey visuals. */}
          <g opacity="0.28">
            {SCAN_LINES.map((line, i) => (
              <motion.polyline
                key={i}
                points={line.pts}
                fill="none"
                stroke={line.color}
                strokeWidth="1.1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.28 }}
                transition={{ duration: 2.2, delay: i * 0.15, ease: 'easeInOut' }}
              />
            ))}
          </g>

          {/* Isometric gallery floor grid */}
          {Array.from({ length: ROWS + 1 }).map((_, r) =>
            Array.from({ length: COLS }).map((_, c) => {
              const p1 = isoPoint(r, c)
              const p2 = isoPoint(r, c + 1)
              return <line key={`h${r}-${c}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#cbd5e1" strokeWidth="1" />
            })
          )}
          {Array.from({ length: COLS + 1 }).map((_, c) =>
            Array.from({ length: ROWS }).map((_, r) => {
              const p1 = isoPoint(r, c)
              const p2 = isoPoint(r + 1, c)
              return <line key={`v${c}-${r}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#cbd5e1" strokeWidth="1" />
            })
          )}

          {/* Isometric 3D pillar blocks (top + two visible side faces) */}
          {sectors.map((s) => {
            const top = isoPoint(s.row, s.col)
            const isActive = s.idx === activeIdx
            const isPredicted = s.idx === predictedIdx && !isActive
            const isSelected = s.idx === selected

            const h = isActive ? PILLAR_HEIGHT * 0.55 : PILLAR_HEIGHT
            const topFill = isActive ? '#D32F2F' : isPredicted ? '#F57C00' : isSelected ? '#38bdf8' : '#1A365D'
            const leftFill = isActive ? '#991b1b' : isPredicted ? '#c2680a' : isSelected ? '#0284c7' : '#0A2540'
            const rightFill = isActive ? '#b91c1c' : isPredicted ? '#d97706' : isSelected ? '#0ea5e9' : '#13294f'

            const halfW = TILE_W * 0.32
            const halfH = TILE_H * 0.32
            const topN = { x: top.x, y: top.y - halfH }
            const topE = { x: top.x + halfW, y: top.y }
            const topS = { x: top.x, y: top.y + halfH }
            const topW = { x: top.x - halfW, y: top.y }

            return (
              <g
                key={s.id}
                onClick={() => setSelected(s.idx)}
                className="cursor-pointer"
                filter={isActive ? 'url(#collapseGlow)' : 'url(#softShadow)'}
              >
                <polygon
                  points={`${topW.x},${topW.y} ${topS.x},${topS.y} ${topS.x},${topS.y + h} ${topW.x},${topW.y + h}`}
                  fill={leftFill}
                />
                <polygon
                  points={`${topS.x},${topS.y} ${topE.x},${topE.y} ${topE.x},${topE.y + h} ${topS.x},${topS.y + h}`}
                  fill={rightFill}
                />
                <motion.polygon
                  points={`${topN.x},${topN.y} ${topE.x},${topE.y} ${topS.x},${topS.y} ${topW.x},${topW.y}`}
                  fill={topFill}
                  stroke={isSelected ? '#0A2540' : 'none'}
                  strokeWidth={isSelected ? 1.5 : 0}
                  animate={isActive ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
                  transition={isActive ? { duration: 0.9, repeat: Infinity } : {}}
                />
                {!isActive && !isPredicted && (
                  <circle cx={top.x} cy={top.y} r="2" fill="#22c55e" opacity="0.9" />
                )}
                <text x={top.x} y={top.y + h + 13} fontSize="7" fill="#64748b" textAnchor="middle" fontFamily="Roboto Mono, monospace">
                  {s.id}
                </text>
              </g>
            )
          })}

          <g transform={`translate(${ORIGIN_X}, ${ORIGIN_Y - 26})`}>
            <motion.circle
              r="5"
              fill="#0A2540"
              stroke="#38bdf8"
              strokeWidth="2"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <text x="0" y="-10" fontSize="8" fill="#0A2540" textAnchor="middle" fontWeight="600" fontFamily="Roboto Mono, monospace">
              NODE-01
            </text>
          </g>
        </motion.svg>

        <AnimatePresence>
          {severity !== 'SAFE' && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-2 right-2 flex flex-col gap-1 items-end"
            >
              {activeIdx !== null && (
                <span className="text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-700 border border-red-300 rounded px-2 py-0.5 shadow-sm">
                  Active subsidence: {sectors.find((s) => s.idx === activeIdx)?.id}
                </span>
              )}
              {predictedIdx !== null && (
                <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-300 rounded px-2 py-0.5 shadow-sm">
                  AI predicted zone: {sectors.find((s) => s.idx === predictedIdx)?.id}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-2 left-2 text-[9px] text-slate-400 italic bg-white/80 rounded px-1.5 py-0.5">
          Isometric illustrative layout &middot; wireframe motif is decorative, not surveyed LIDAR data
        </div>
      </div>

      <div className="px-3 py-2 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between flex-wrap gap-2 bg-white">
        <span>
          {selectedSector
            ? `Sector ${selectedSector.id} \u00b7 ${
                selectedSector.idx === activeIdx
                  ? 'active subsidence (illustrative, nearest to instrumented node)'
                  : selectedSector.idx === predictedIdx
                  ? 'AI predicted failure zone'
                  : 'nominal \u2014 no anomaly reported'
              }`
            : 'Tap a pillar for sector detail \u00b7 single-node system: sector highlighting is a directional projection, not per-sector sensing'}
        </span>
        <span className="font-mono">
          &Delta;&theta;/&Delta;t &asymp; {displacementRate.toFixed(2)}&deg;
        </span>
      </div>
    </div>
  )
}
