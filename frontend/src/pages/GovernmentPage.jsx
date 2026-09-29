import { useOutletContext } from 'react-router-dom'
import GovernmentDashboard from './GovernmentDashboard'
export default function GovernmentPage() {
  const { state, health, refresh } = useOutletContext()
  return <GovernmentDashboard s={state} health={health} refresh={refresh} />
}
