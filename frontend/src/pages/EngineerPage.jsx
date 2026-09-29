import { useOutletContext } from 'react-router-dom'
import EngineerDashboard from './EngineerDashboard'
export default function EngineerPage() {
  const { state, health, refresh, initialNode } = useOutletContext()
  return <EngineerDashboard s={state} health={health} refresh={refresh} initialNode={initialNode} />
}
