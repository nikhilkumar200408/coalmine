import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useSamadhaan, api } from '../hooks/useSamadhaan'

/**
 * Shared shell for the two internal/staff-only views (Government, Engineer). Worker and Resident are
 * separate standalone routes with their own minimal header — they are not nested under this layout,
 * since they are meant to be opened directly (e.g. from a shared link or a node's QR code) without any
 * staff navigation or controls being visible.
 */
export default function StaffLayout() {
  const { state, health, linked, staleSec, refresh } = useSamadhaan()
  const { nodeId } = useParams()
  const simulating = state?.demo.active
  const toggleSim = () => api('/api/v1/demo', 'POST', { active: !state.demo.active }).catch((e) => alert(e.message))
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-navy text-white sticky top-0 z-50">
        <div className="max-w-[1700px] mx-auto px-4 py-2 flex flex-wrap items-center gap-3">
          <div className="font-bold tracking-widest text-sm">SAMADHAAN</div>
          <nav aria-label="Section" className="flex bg-white/10 rounded overflow-hidden">
            {[['/government', 'Government'], ['/engineer', 'Engineer']].map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `px-3 py-1.5 text-xs font-semibold ${isActive ? 'bg-white text-navy' : 'text-white/80 hover:bg-white/10'}`}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[11px]">
            <span title="Connection to the local backend"><span style={{ color: linked ? '#4ADE80' : '#F87171' }}>&#9679;</span> {linked ? 'Backend online' : 'Backend offline — reconnecting'}</span>
            {state && <span className="hidden md:inline">Real node (USB): <b>{state.real_node.connected ? `CONNECTED (${state.real_node.link})` : 'WAITING FOR TELEMETRY'}</b></span>}
            {state && <button onClick={toggleSim} className={`px-2 py-1 rounded font-bold ${simulating ? 'bg-purple-600' : 'bg-white/15 hover:bg-white/25'}`}>{simulating ? 'EXIT SIMULATION' : 'SIMULATION MODE'}</button>}
          </div>
        </div>
        {simulating && <div className="bg-purple-800 text-center text-xs font-bold py-1 tracking-wide">SIMULATION MODE — NOT LIVE MINE TELEMETRY (the real USB-connected node keeps streaming independently)</div>}
        {!linked && state && <div className="bg-red-700 text-center text-xs font-bold py-1">Backend offline — showing last known state{staleSec != null ? ` (${staleSec}s ago)` : ''}. Values below are not live.</div>}
      </header>
      {!state
        ? <div className="p-10 text-center text-sm text-slate-600">{linked ? 'Loading platform state…' : 'Backend offline. Start it with: uvicorn main:app --host 0.0.0.0 --port 8000'}</div>
        : <Outlet context={{ state, health, refresh, initialNode: nodeId }} />}
    </div>
  )
}
