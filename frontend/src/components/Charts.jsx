import { useEffect, useRef, useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { computeRiskScoreClientSide } from '../hooks/useTelemetry'

ChartJS.register(LineElement, BarElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const darkTooltip = {
  backgroundColor: '#ffffff',
  borderColor: '#e2e8f0',
  borderWidth: 1,
  titleColor: '#0f172a',
  bodyColor: '#334155',
  titleFont: { family: 'Roboto Mono', size: 10 },
  bodyFont: { family: 'Roboto Mono', size: 10 },
  padding: 8,
  cornerRadius: 4,
  displayColors: true,
}

const darkGrid = {
  color: '#1e293b',
  borderDash: [4, 4],
  drawBorder: false,
}

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  scales: {
    x: { display: false, grid: { display: false } },
    y: { grid: darkGrid, ticks: { color: '#64748b', font: { family: 'Roboto Mono', size: 9 } } },
  },
}

function labelsFrom(history) {
  return history.map((r) => new Date(r.timestamp).toLocaleTimeString())
}

// Builds a canvas linearGradient for area fills -- must be created lazily
// against the actual chart canvas context, so each chart component grabs
// its own gradient via the chart ref rather than a static color.
function useGradient(colorFrom, colorTo) {
  const chartRef = useRef(null)
  const [gradient, setGradient] = useState(null)

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const ctx = chart.ctx
    const g = ctx.createLinearGradient(0, 0, 0, chart.height || 130)
    g.addColorStop(0, colorFrom)
    g.addColorStop(1, colorTo)
    setGradient(g)
  }, [colorFrom, colorTo])

  return [chartRef, gradient]
}

export function TiltChart({ history }) {
  const [pitchRef, pitchGrad] = useGradient('rgba(56,189,248,0.35)', 'rgba(56,189,248,0)')

  const data = {
    labels: labelsFrom(history),
    datasets: [
      {
        label: 'Pitch dev (deg)',
        data: history.map((r) => r.pitch_dev),
        borderColor: '#38bdf8',
        backgroundColor: pitchGrad || 'rgba(56,189,248,0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 1.75,
      },
      {
        label: 'Roll dev (deg)',
        data: history.map((r) => r.roll_dev),
        borderColor: '#fb923c',
        backgroundColor: 'rgba(251,146,60,0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 1.75,
      },
    ],
  }
  return (
    <div className="h-32">
      <Line
        ref={pitchRef}
        data={data}
        options={{
          ...commonOptions,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: '#64748b' } },
            tooltip: darkTooltip,
          },
        }}
      />
    </div>
  )
}

export function SoundChart({ history }) {
  const [chartRef, gradient] = useGradient('rgba(20,184,166,0.4)', 'rgba(20,184,166,0)')

  const data = {
    labels: labelsFrom(history),
    datasets: [
      {
        label: 'Acoustic deviation',
        data: history.map((r) => r.sound),
        borderColor: '#2dd4bf',
        backgroundColor: gradient || 'rgba(20,184,166,0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 1.75,
      },
    ],
  }
  return (
    <div className="h-32">
      <Line
        ref={chartRef}
        data={data}
        options={{ ...commonOptions, plugins: { legend: { display: false }, tooltip: darkTooltip } }}
      />
    </div>
  )
}

export function RiskChart({ history }) {
  const data = {
    labels: labelsFrom(history),
    datasets: [
      {
        label: 'Risk score',
        data: history.map((r) => r.risk_score ?? computeRiskScoreClientSide(r.pitch_dev, r.roll_dev, r.sound)),
        backgroundColor: (ctx) => {
          const v = ctx.raw ?? 0
          return v >= 85 ? '#ef4444' : v >= 60 ? '#f59e0b' : '#22c55e'
        },
        borderRadius: 2,
        maxBarThickness: 10,
      },
    ],
  }
  return (
    <div className="h-32">
      <Bar
        data={data}
        options={{
          ...commonOptions,
          plugins: { legend: { display: false }, tooltip: darkTooltip },
          scales: { x: { display: false, grid: { display: false } }, y: { max: 100, grid: darkGrid, ticks: { color: '#64748b', font: { family: 'Roboto Mono', size: 9 } } } },
        }}
      />
    </div>
  )
}
