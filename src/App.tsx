import { Routes, Route } from 'react-router-dom'

function Home() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-green-700">🌱 Mi Huerto PR</h1>
      <p className="mt-2 text-gray-500">Your agriculture app is ready to grow.</p>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}

export default App