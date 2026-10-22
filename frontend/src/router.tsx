import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PageShell } from '@/common/components/PageShell'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { TestConnectionPage } from './pages/TestConnectionPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/test-connection" element={<TestConnectionPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function NotFoundPage() {
  return (
    <PageShell>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">This page isn't built yet.</p>
      </div>
    </PageShell>
  )
}
