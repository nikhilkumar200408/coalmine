import { useSamadhaan } from '../hooks/useSamadhaan'
import ResidentDashboard from './ResidentDashboard'

/** Standalone entry point for the public/community view — no staff chrome, no admin controls. */
export default function ResidentPage() {
  const { state, linked } = useSamadhaan()
  if (!state) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-600">{linked ? 'Loading…' : 'Connecting to the monitoring platform…'}</div>
  return <ResidentDashboard s={state} />
}
