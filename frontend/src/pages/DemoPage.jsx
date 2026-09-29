import { useEffect, useState } from 'react'
import App from '../App'

const SCENARIOS = [
  ['normal', 'Normal Operation'],
  ['vibration', 'Machinery Vibration'],
  ['gradual', 'Gradual Subsidence'],
  ['rapid', 'Rapid Deformation'],
  ['fault', 'Sensor Failure'],
  ['outage', 'Communication Outage'],
]

export default function DemoPage() {
  const [scenario, setScenario] = useState(() => localStorage.getItem('samadhaan_demo_scenario') || 'normal')

  useEffect(() => {
    localStorage.setItem('samadhaan_demo_scenario', scenario)
    window.dispatchEvent(new Event('samadhaan-demo-scenario'))
  }, [scenario])

  return (
    <div>
      <div className="sticky top-0 z-[2000] bg-slate-950 text-white border-b border-slate-700 px-4 py-3">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm mr-2">SAMADHAAN · MONITORING CONSOLE</span>
          {SCENARIOS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScenario(key)}
              className={`px-3 py-1.5 rounded text-[11px] border transition ${scenario === key ? 'bg-white text-slate-900 border-white' : 'bg-transparent text-slate-300 border-slate-600 hover:border-slate-400'}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-400">Local test mode · backend optional</span>
        </div>
      </div>
      <App />
    </div>
  )
}
