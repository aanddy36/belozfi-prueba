import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TestConnectionPage } from './pages/TestConnectionPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TestConnectionPage />} />
      </Routes>
    </BrowserRouter>
  )
}
