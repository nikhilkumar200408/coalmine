import { useSamadhaan } from '../hooks/useSamadhaan'
import WorkerDashboard from './WorkerDashboard'

/** Standalone entry point — meant to be opened directly (shared link / printed QR), no staff chrome. */
export default function WorkerPage() {
  const { state, linked } = useSamadhaan()
  if (!state) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-600">{linked ? 'Loading…' : 'Connecting to the monitoring platform…'}</div>
  return <WorkerDashboard s={state} />
}
