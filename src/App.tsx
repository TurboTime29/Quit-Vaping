import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DialogHost } from './components/Dialogs'
import { useAutoSync } from './lib/sync'
import { useData } from './store/data'
import History from './pages/History'
import Home from './pages/Home'
import Onboarding from './pages/Onboarding'
import Settings from './pages/Settings'

function RequireProfile({ children }: { children: ReactNode }) {
  const hasProfile = useData((s) => !!s.profile)
  return hasProfile ? children : <Navigate to="/onboarding" replace />
}

export default function App() {
  const theme = useData((s) => s.theme)
  const { pathname } = useLocation()
  useAutoSync()

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff')
  }, [theme])

  return (
    <>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<RequireProfile><Home /></RequireProfile>} />
        <Route path="/history" element={<RequireProfile><History /></RequireProfile>} />
        <Route path="/settings" element={<RequireProfile><Settings /></RequireProfile>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DialogHost />
    </>
  )
}
