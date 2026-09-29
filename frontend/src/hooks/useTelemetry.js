import { useState, useEffect, useRef, useCallback } from 'react'

const BACKEND_HTTP = `http://${window.location.hostname}:8000`
const BACKEND_WS = `ws://${window.location.hostname}:8000/ws/telemetry`

export function computeRiskScoreClientSide(pitchDev, rollDev, sound) {
  const raw = Math.abs(pitchDev) * 1.2 + Math.abs(rollDev) * 1.0 + Math.min(sound, 100) * 0.4
  return Math.max(0, Math.min(100, Math.round(raw)))
}

/**
 * Central telemetry hook. Connects via WebSocket for real-time push;
 * falls back to nothing fake if the backend is unreachable (fields stay
 * null rather than showing invented numbers). Also exposes helper
 * fetchers for the AI summary, projection, evacuation log and node
 * registry, all backed by the real FastAPI endpoints.
 */
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
            // Ingestion latency estimate: wall-clock time between when the
            // backend stamped the reading and when this browser tab received
            // the push. Includes clock skew between machines, so it's an
            // estimate for the console display, not a precise network RTT.
            const stamped = Date.parse(data.timestamp)
            if (!Number.isNaN(stamped)) {
              setLatencyMs(Math.max(0, Date.now() - stamped))
            }
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

    // Seed with whatever the backend already has logged, so the UI
    // isn't empty on first load before any new live packet arrives.
    fetch(`${BACKEND_HTTP}/history?limit=50`)
      .then((r) => r.json())
      .then((rows) => {
        const enriched = rows.map((r) => ({
          ...r,
          risk_score: computeRiskScoreClientSide(r.pitch_dev, r.roll_dev, r.sound),
        }))
        setHistory((h) => (h.length ? h : enriched))
        if (enriched.length && !latest) setLatest(enriched[enriched.length - 1])
      })
      .catch(() => {})

    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { latest, history, connected, transport, heartbeatLossPct, latencyMs, BACKEND_HTTP }
}

export async function fetchAISummary() {
  const res = await fetch(`${BACKEND_HTTP}/api/v1/ai-summary`)
  return res.json()
}

export async function fetchProjection() {
  const res = await fetch(`${BACKEND_HTTP}/api/v1/projection`)
  return res.json()
}

export async function fetchEvacuationLog() {
  const res = await fetch(`${BACKEND_HTTP}/api/v1/evacuation-log`)
  return res.json()
}

export async function fetchNodes() {
  const res = await fetch(`${BACKEND_HTTP}/api/v1/nodes`)
  return res.json()
}

export { BACKEND_HTTP }
