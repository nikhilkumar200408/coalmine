import { useEffect, useMemo, useState } from 'react'

const MODES = {
  normal: { label: 'Normal operation', tilt: 1.2, strain: 8, sound: 48, temp: 28.4, step: 0.12 },
  machinery: { label: 'Machinery vibration', tilt: 2.4, strain: 12, sound: 72, temp: 29.1, step: 0.18 },
  gradual: { label: 'Gradual subsidence', tilt: 7.5, strain: 34, sound: 81, temp: 29.8, step: 0.32 },
  rapid: { label: 'Rapid deformation', tilt: 18.5, strain: 68, sound: 94, temp: 31.2, step: 0.8 },
  sensor: { label: 'Sensor failure', tilt: null, strain: null, sound: null, temp: 28.8, step: 0 },
  network: { label: 'Communication outage', tilt: 6.2, strain: 28, sound: 79, temp: 29.4, step: 0.25 },
}

function riskOf(v) {
  if (v.sensorFault) return 0
  return Math.max(0, Math.min(100, Math.round(
    Math.abs(v.tilt) * 2.2 + v.strain * 0.55 + Math.max(0, v.sound - 40) * 0.55
  )))
}

function levelOf(r, fault) {
  if (fault) return 'DATA LIMITED'
  if (r >= 75) return 'CRITICAL'
  if (r >= 45) return 'CAUTION'
  return 'SAFE'
}

export default function DemoPage() {
  const [mode, setMode] = useState('normal')
  const [running, setRunning] = useState(false)
  const [t, setT] = useState(0)
  const [manual, setManual] = useState(false)
  const [v, setV] = useState({ tilt: 1.2, strain: 8, sound: 48, temp: 28.4, sensorFault: false, offline: false })

  const preset = MODES[mode]
  const risk = riskOf(v)
  const level = levelOf(risk, v.sensorFault)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setT((x) => x + 1)
      setV((cur) => {
        if (mode === 'sensor') return { ...cur, sensorFault: true }
        const f = Math.min(1, (t + 1) / 12)
        const jitter = (Math.random() - 0.5)
        return {
          tilt: Math.max(0, (preset.tilt * f) + jitter),
          strain: Math.max(0, (preset.strain * f) + jitter * 2),
          sound: Math.max(35, (preset.sound * f) + 40 * (1 - f) + jitter * 3),
          temp: 27.8 + (preset.temp - 27.8) * f,
          sensorFault: false,
          offline: mode === 'network' && f > 0.35,
        }
      })
    }, 900)
    return () => clearInterval(id)
  }, [running, mode, t, preset])

  const historyWidth = useMemo(() => Math.min(100, risk), [risk])

  const selectMode = (key) => {
    const p = MODES[key]
    setMode(key); setT(0); setRunning(false)
    setV({
      tilt: p.tilt ?? 0,
      strain: p.strain ?? 0,
      sound: p.sound ?? 0,
      temp: p.temp,
      sensorFault: key === 'sensor',
      offline: false,
    })
    setManual(false)
  }

  const reset = () => selectMode('normal')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-[#0A2540] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">SAMADHAAN</div>
          <div className="text-[11px] text-slate-300">Mine Subsidence Monitoring & Early Warning System · SIH 2026 · SIH26025</div>
        </div>
        <div className="text-[10px] border border-slate-500 rounded px-2 py-1">INTERACTIVE DEMO MODE · NO BACKEND REQUIRED</div>
      </header>

      <main className="max-w-[1400px] mx-auto p-5 space-y-5">
        <section className="bg-white border rounded shadow-sm p-4">
          <div className="flex flex-wrap justify-between gap-3 items-end">
            <div>
              <h1 className="font-semibold text-base">Scenario Lab</h1>
              <p className="text-xs text-slate-500 mt-1">Change the mine condition and watch the sensor values, composite risk and response state change in the browser.</p>
            </div>
            <div className="text-[11px] text-slate-500">Scenario time: <b>T+{String(t).padStart(2, '0')} s</b></div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(MODES).map(([key, p]) => (
              <button key={key} onClick={() => selectMode(key)}
                className={`px-3 py-2 rounded border text-xs ${mode === key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50'}`}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setRunning((x) => !x)} className={`px-4 py-2 rounded text-xs font-semibold ${running ? 'bg-amber-600 text-white' : 'bg-emerald-700 text-white'}`}>
              {running ? 'PAUSE SCENARIO' : 'RUN SCENARIO'}
            </button>
            <button onClick={reset} className="px-3 py-2 rounded border text-xs bg-white">RESET</button>
          </div>
        </section>

        <section className="grid md:grid-cols-4 gap-4">
          <Metric title="Tilt deviation" value={v.sensorFault ? '—' : `${v.tilt.toFixed(1)}°`} note="MPU6050 / calibrated baseline" />
          <Metric title="Deformation / strain" value={v.sensorFault ? '—' : `${v.strain.toFixed(0)} %`} note="prototype deformation input" />
          <Metric title="Acoustic level" value={v.sensorFault ? '—' : `${v.sound.toFixed(0)} dB`} note="acoustic / vibration proxy" />
          <Metric title="Temperature" value={`${v.temp.toFixed(1)} °C`} note="environmental reading" />
        </section>

        <section className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
          <div className="bg-white border rounded shadow-sm p-5">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Composite risk</div>
                <div className="text-5xl font-bold mt-1">{v.sensorFault ? '—' : risk}<span className="text-base font-normal text-slate-400"> / 100</span></div>
              </div>
              <div className={`px-3 py-2 rounded text-xs font-bold ${level === 'CRITICAL' ? 'bg-red-100 text-red-800' : level === 'CAUTION' ? 'bg-amber-100 text-amber-800' : level === 'DATA LIMITED' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>
                {level}
              </div>
            </div>
            <div className="h-3 bg-slate-100 rounded mt-5 overflow-hidden">
              <div className={`h-full transition-all duration-500 ${level === 'CRITICAL' ? 'bg-red-600' : level === 'CAUTION' ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${historyWidth}%` }} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-5 text-xs">
              <div className="border rounded p-3"><b>Decision</b><div className="text-slate-500 mt-1">{v.sensorFault ? 'Hold alert decision — sensor data unavailable.' : risk >= 75 ? 'Immediate field verification / affected-sector response.' : risk >= 45 ? 'Increase observation and verify field conditions.' : 'Continue monitoring.'}</div></div>
              <div className="border rounded p-3"><b>Data path</b><div className="text-slate-500 mt-1">{v.offline ? 'LOCAL BUFFERING — communication outage scenario' : 'BROWSER SIMULATION — deterministic UI test path'}</div></div>
            </div>
          </div>

          <div className="bg-white border rounded shadow-sm p-5">
            <div className="text-xs font-semibold uppercase text-slate-500 mb-3">Sensor correlation</div>
            <Correlation name="Tilt" value={v.tilt} limit={5} />
            <Correlation name="Strain" value={v.strain} limit={25} />
            <Correlation name="Acoustic" value={v.sound} limit={85} />
            <div className="border-t mt-4 pt-4 text-xs text-slate-500">
              The demo changes multiple inputs together so the judge can see why the risk state changes. This is a software demonstration, not measured mine data.
            </div>
          </div>
        </section>

        <section className="bg-white border rounded shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="font-semibold text-sm">Response timeline</div>
            <span className="text-[10px] text-slate-500">INTERACTIVE · LIVE IN BROWSER</span>
          </div>
          <div className="grid md:grid-cols-4 gap-2 text-xs">
            <Timeline n="01" text="Baseline readings" active={t >= 0} />
            <Timeline n="02" text="Deviation increases" active={t >= 3 && risk >= 25} />
            <Timeline n="03" text="Multi-sensor evidence" active={t >= 6 && risk >= 45} />
            <Timeline n="04" text="Warning state" active={t >= 9 && risk >= 75} />
          </div>
        </section>

        <footer className="text-[11px] text-slate-400 text-center py-3">
          Prototype for SIH 2026 evaluation · Demo values are simulated and clearly labelled.
        </footer>
      </main>
    </div>
  )
}

function Metric({ title, value, note }) {
  return <div className="bg-white border rounded shadow-sm p-4"><div className="text-[10px] uppercase font-semibold text-slate-500">{title}</div><div className="text-2xl font-bold mt-1 font-mono">{value}</div><div className="text-[10px] text-slate-400 mt-1">{note}</div></div>
}
function Correlation({ name, value, limit }) {
  const active = value !== null && value >= limit
  return <div className="mb-4"><div className="flex justify-between text-xs"><span>{name}</span><span className={active ? 'font-semibold text-red-700' : 'text-slate-500'}>{value === null ? 'UNAVAILABLE' : `${value.toFixed(1)} · threshold ${limit}`}</span></div><div className="h-2 bg-slate-100 rounded mt-1"><div className={active ? 'h-full bg-red-500 rounded' : 'h-full bg-slate-400 rounded'} style={{ width: `${value === null ? 0 : Math.min(100, (value / (limit * 1.6)) * 100)}%` }} /></div></div>
}
function Timeline({ n, text, active }) {
  return <div className={`border rounded p-3 ${active ? 'border-slate-300 bg-slate-50' : 'opacity-40'}`}><div className="font-mono text-[10px] text-slate-400">STEP {n}</div><div className="font-medium mt-1">{text}</div></div>
}
