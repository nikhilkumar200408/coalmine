import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import StaffLayout from './layouts/StaffLayout'
import GovernmentPage from './pages/GovernmentPage'
import EngineerPage from './pages/EngineerPage'
import WorkerPage from './pages/WorkerPage'
import ResidentPage from './pages/ResidentPage'
import DemoPage from './pages/DemoPage'

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<StaffLayout />}>
          <Route path="/government" element={<GovernmentPage />} />
          <Route path="/engineer" element={<EngineerPage />} />
          <Route path="/nodes/:nodeId" element={<EngineerPage />} />
        </Route>
        <Route path="/worker" element={<WorkerPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/resident" element={<ResidentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
