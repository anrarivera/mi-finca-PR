import { Routes, Route } from 'react-router-dom'
import Layout from './components/shared/layout'
import HomePage from '@/pages/home/homePage'

function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#2d4a1e]">Dashboard</h1>
      <p className="mt-2 text-gray-500">Dashboard page coming soon.</p>
    </div>
  )
}

function Settings() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#2d4a1e]">Settings</h1>
      <p className="mt-2 text-gray-500">Settings page coming soon.</p>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App