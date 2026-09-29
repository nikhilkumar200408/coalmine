import { useState, useEffect, useRef, useCallback } from 'react'

const HOST = window.location.hostname
export const API = `http://${HOST}:8000`
const WS = `ws://${HOST}:8000/ws/telemetry`

/** Admin token (optional) is only needed if the backend sets SAMADHAAN_ADMIN_TOKEN. */
export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' }
  const tok = localStorage.getItem('samadhaan_admin')
  if (tok) headers['X-Admin-Token'] = tok
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * Single source of truth for the v6 platform: the backend pushes a full `state` snapshot (~1 Hz) plus discrete
 * events (incident_created, scenario_tick, sensor_fault, route_update, network_status ...). Every role view
 * (Government / Engineer / Worker / Resident) renders from this same object, so they stay synchronised.
 */
export function useSamadhaan() {
  const [state, setState] = useState(null)
  const [health, setHealth] = useState(null)
  const [events, setEvents] = useState([])
  const [linked, setLinked] = useState(false)
  const [lastMsg, setLastMsg] = useState(0)
  const retry = useRef(1000)

  useEffect(() => {
    let ws, timer, closed = false
    const connect = () => {
      ws = new WebSocket(WS)
      ws.onopen = () => { setLinked(true); retry.current = 1000 }
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data)
        setLastMsg(Date.now())
        if (m.type === 'state') setState(m.state)
        else if (m.type === 'system_health') setHealth(m.health)
        else if (m.type !== 'telemetry') setEvents((ev) => [{ ...m, at: Date.now() }, ...ev].slice(0, 40))
      }
      ws.onclose = () => {
        setLinked(false)
        if (!closed) { timer = setTimeout(connect, retry.current); retry.current = Math.min(retry.current * 2, 10000) }  // exponential backoff
      }
      ws.onerror = () => ws.close()
    }
    connect()
    fetch(`${API}/api/v1/dashboard/summary`).then((r) => r.json()).then((s) => setState((c) => c || s)).catch(() => {})
    return () => { closed = true; clearTimeout(timer); ws && ws.close() }
  }, [])

  const staleSec = lastMsg ? Math.round((Date.now() - lastMsg) / 1000) : null
  // Manual refresh: incident/escalation actions call this right after a POST succeeds so the UI
  // reflects the change immediately instead of waiting for the next ~1s WebSocket push.
  const refresh = useCallback(() => fetch(`${API}/api/v1/dashboard/summary`).then((r) => r.json()).then(setState).catch(() => {}), [])
  return { state, health, events, linked, staleSec, refresh }
}

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return n
}

export function usePoll(path, ms = 4000, deps = []) {
  const [data, setData] = useState(null)
  const load = useCallback(() => api(path).then(setData).catch(() => {}), [path])
  useEffect(() => { load(); const t = setInterval(load, ms); return () => clearInterval(t) }, [load, ms, ...deps]) // eslint-disable-line
  return data
}
