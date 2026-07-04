import { Routes, Route } from 'react-router-dom'
import Layout from './components/shared/layout'
import HomePage from '@/pages/home/homePage'
import DashboardPage from '@/pages/dashboard/dashboardPage'
import SettingsPage from '@/pages/settings/settingsPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
