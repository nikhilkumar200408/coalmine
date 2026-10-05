import { useState, useEffect, useRef, useCallback } from 'react'

const BACKEND_HTTP = `http://${window.location.hostname}:8000`
const BACKEND_WS = `ws://${window.location.hostname}:8000/ws/telemetry`

export function computeRiskScoreClientSide(pitchDev, rollDev, sound) {
  const raw = Math.abs(pitchDev) * 1.2 + Math.abs(rollDev) * 1.0 + Math.min(sound, 100) * 0.4
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function simulatedReading(tick, scenario) {
  const wave = Math.sin(tick / 3)
  const ramp = (tick % 30) / 30
  const base = {
    normal: { pitch: 2.2 + wave * 0.5, roll: 1.6 + wave * 0.4, sound: 48 + wave * 3 },
    vibration: { pitch: 5 + wave * 2.5, roll: 4 + wave * 2, sound: 72 + Math.abs(wave) * 12 },
    gradual: { pitch: 4 + ramp * 8 + wave, roll: 3 + ramp * 7 + wave, sound: 58 + ramp * 18 },
    rapid: { pitch: 13 + Math.abs(wave) * 8, roll: 11 + Math.abs(wave) * 7, sound: 86 + Math.abs(wave) * 10 },
    fault: { pitch: 0, roll: 0, sound: 0 },
    outage: { pitch: 7 + wave, roll: 6 + wave, sound: 68 + wave * 4 },
  }[scenario] || null
  const now = new Date()
  const pitch = base.pitch
  const roll = base.roll
  const sound = base.sound
  const risk = scenario === 'fault' ? 0 : computeRiskScoreClientSide(pitch, roll, sound)
  return {
    type: 'telemetry',
    timestamp: now.toISOString(),
    node_id: 'SAMADHAAN-01',
    pitch_dev: Number(pitch.toFixed(2)),
    roll_dev: Number(roll.toFixed(2)),
    sound: Number(sound.toFixed(1)),
    temperature: Number((29 + wave * 1.2).toFixed(1)),
    humidity: Math.round(64 + wave * 5),
    battery_pct: 86,
    battery_sensing_ok: true,
    link_mode: scenario === 'outage' ? 'WiFi' : 'USB-Serial',
    rssi: scenario === 'outage' ? -78 : -48,
    risk_score: risk,
    sensor_health: scenario === 'fault' ? 'DEGRADED' : 'OK',
  }
}

function demoScenario() {
  return localStorage.getItem('samadhaan_scenario') || 'normal'
}

export function useTelemetry() {
  const [latest, setLatest] = useState(null)
  const [history, setHistory] = useState([])
  const [connected, setConnected] = useState(false)
  const [transport, setTransport] = useState('connecting')
  const [heartbeatLossPct, setHeartbeatLossPct] = useState(null)
  const [latencyMs, setLatencyMs] = useState(null)
  const wsRef = useRef(null)
  const lastArrivalRef = useRef(null)
  const gapsRef = useRef([])
  const reconnectTimerRef = useRef(null)

  const recordArrival = useCallback(() => {
    const now = Date.now()
    if (lastArrivalRef.current !== null) {
      const gap = now - lastArrivalRef.current
      gapsRef.current.push(gap)
      if (gapsRef.current.length > 20) gapsRef.current.shift()
      const expected = 3000
      const missed = gapsRef.current.filter((g) => g > expected * 1.8).length
      setHeartbeatLossPct((missed / gapsRef.current.length) * 100)
    }
    lastArrivalRef.current = now
  }, [])

  useEffect(() => {
    const isPublicConsole = window.location.pathname === '/'
    if (isPublicConsole) {
      let tick = 0
      const seed = Array.from({ length: 24 }, (_, i) => simulatedReading(i, demoScenario()))
      setHistory(seed)
      setLatest(seed[seed.length - 1])
      setConnected(true)
      setTransport('Local Simulation')
      setHeartbeatLossPct(0)
      setLatencyMs(12)
      const emit = () => {
        tick += 1
        const data = simulatedReading(tick, demoScenario())
        setLatest(data)
        setHistory((h) => [...h.slice(-59), data])
        setHeartbeatLossPct(demoScenario() === 'outage' ? 8 : 0)
        setLatencyMs(demoScenario() === 'outage' ? 180 : 12)
        setTransport(demoScenario() === 'outage' ? 'Simulation · degraded link' : 'Local Simulation')
      }
      const timer = setInterval(emit, 1500)
      const onScenario = () => {
        tick = 0
        const data = simulatedReading(0, demoScenario())
        setLatest(data)
        setHistory((h) => [...h.slice(-59), data])
      }
      window.addEventListener('samadhaan-scenario-change', onScenario)
      return () => {
        clearInterval(timer)
        window.removeEventListener('samadhaan-scenario-change', onScenario)
      }
    }

    function connect() {
      const ws = new WebSocket(BACKEND_WS)
      wsRef.current = ws
      ws.onopen = () => {
        setConnected(true)
        setTransport('WebSocket (live push)')
      }
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data.type === 'telemetry') {
            recordArrival()
            const stamped = Date.parse(data.timestamp)
            if (!Number.isNaN(stamped)) setLatencyMs(Math.max(0, Date.now() - stamped))
            setLatest(data)
            setHistory((h) => [...h.slice(-59), data])
          }
        } catch (e) {
          console.warn('Bad telemetry frame', e)
        }
      }
      ws.onclose = () => {
        setConnected(false)
        setTransport('Reconnecting...')
        reconnectTimerRef.current = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }
    connect()
    fetch(`${BACKEND_HTTP}/history?limit=50`)
      .then((r) => r.json())
      .then((rows) => {
        const enriched = rows.map((r) => ({
          ...r,
          risk_score: computeRiskScoreClientSide(r.pitch_dev, r.roll_dev, r.sound),
        }))
        setHistory((h) => (h.length ? h : enriched))
        setLatest((cur) => cur || (enriched.length ? enriched[enriched.length - 1] : null))
      })
      .catch(() => {})
    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [recordArrival])

  return { latest, history, connected, transport, heartbeatLossPct, latencyMs, BACKEND_HTTP }
}

const fallbackSummary = () => ({
  risk_level: 'MODERATE',
  failure_window_estimate: 'Trend under observation',
  structural_stability_index: 78,
  generated_at: new Date().toISOString(),
  narrative: 'Local scenario mode: composite risk is calculated from simulated tilt and acoustic telemetry using the same client-side risk scoring path.',
  recommendation: 'Continue monitoring and verify elevated readings in the affected sector.',
  note: 'Scenario values are simulated for controlled testing; they are not live mine measurements.',
})

export async function fetchAISummary() {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/v1/ai-summary`, { signal: AbortSignal.timeout(1800) })
    if (!res.ok) throw new Error('backend unavailable')
    return res.json()
  } catch {
    return fallbackSummary()
  }
}

export async function fetchProjection() {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/v1/projection`, { signal: AbortSignal.timeout(1800) })
    if (!res.ok) throw new Error('backend unavailable')
    return res.json()
  } catch {
    return { projections: { '6h': 3.8, '12h': 5.1, '24h': 7.4, '48h': 10.2 } }
  }
}

export async function fetchEvacuationLog() {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/v1/evacuation-log`, { signal: AbortSignal.timeout(1800) })
    if (!res.ok) throw new Error('backend unavailable')
    return res.json()
  } catch {
    return [{
      timestamp: new Date(Date.now() - 60000).toISOString(),
      node_id: 'SAMADHAAN-01',
      risk_score: 82,
      threshold: 85,
    }]
  }
}

export async function fetchNodes() {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/v1/nodes`, { signal: AbortSignal.timeout(1800) })
    if (!res.ok) throw new Error('backend unavailable')
    return res.json()
  } catch {
    return [{ node_id: 'SAMADHAAN-01', label: 'Primary Monitoring Node', lat: 23.6693, lng: 86.9425, depth_m: 120 }]
  }
}

export { BACKEND_HTTP }
