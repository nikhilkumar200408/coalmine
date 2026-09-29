import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import StaffLayout from './layouts/StaffLayout'
import GovernmentPage from './pages/GovernmentPage'
import EngineerPage from './pages/EngineerPage'
import WorkerPage from './pages/WorkerPage'
import ResidentPage from './pages/ResidentPage'

/**
 * Government and Engineer are internal/staff views sharing one layout with a section switcher.
 * Worker and Resident are separate, standalone dashboards — each its own route with no staff chrome,
 * suitable for sharing as a direct link or opening from a node's QR code on a phone.
 */
export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<StaffLayout />}>
          <Route path="/government" element={<GovernmentPage />} />
          <Route path="/engineer" element={<EngineerPage />} />
          <Route path="/nodes/:nodeId" element={<EngineerPage />} />
        </Route>
        <Route path="/worker" element={<WorkerPage />} />
        <Route path="/resident" element={<ResidentPage />} />
        <Route path="*" element={<Navigate to="/engineer" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
