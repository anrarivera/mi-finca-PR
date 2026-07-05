import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/shared/layout'
import HomePage from '@/pages/home/homePage'
import DashboardPage from '@/pages/dashboard/dashboardPage'
import InventoryPage from '@/pages/inventory/inventoryPage'
import SimulatorPage from '@/pages/simulator/simulatorPage'
import SettingsPage from '@/pages/settings/settingsPage'
import LoginPage from '@/pages/auth/loginPage'
import RegisterPage from '@/pages/auth/registerPage'
import { useAuthStore } from '@/store/useAuthStore'

function App() {
  // If a session was persisted, silently renew it via the refresh cookie.
  useEffect(() => {
    useAuthStore.getState().restoreSession()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/simulador" element={<SimulatorPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
