import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { WorkforceSessionProvider } from './data/session'
import { useWorkforceSession } from './data/useWorkforceSession'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(module => ({ default: module.DashboardPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then(module => ({ default: module.ImportPage })))

function RequireUpload({ children }: { children: React.ReactNode }) {
  const { snapshot } = useWorkforceSession()
  return snapshot ? children : <Navigate to="/impor" replace />
}

export default function App() {
  return <WorkforceSessionProvider><BrowserRouter><Suspense fallback={<div className="route-loading">Memuat halaman...</div>}><Routes>
    <Route index element={<Navigate to="/impor" replace />} />
    <Route path="dashboard" element={<RequireUpload><DashboardPage /></RequireUpload>} />
    <Route path="direktori" element={<RequireUpload><Navigate to="/dashboard#pegawai" replace /></RequireUpload>} />
    <Route path="impor" element={<ImportPage />} />
    <Route path="*" element={<Navigate to="/impor" replace />} />
  </Routes></Suspense></BrowserRouter></WorkforceSessionProvider>
}
