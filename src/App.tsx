import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DialogHost } from './components/Dialogs'
import { useAutoSync } from './lib/sync'
import { useData } from './store/data'
import Craving from './pages/Craving'
import History from './pages/History'
import Home from './pages/Home'
import Insights from './pages/Insights'
import Onboarding from './pages/Onboarding'
import Settings from './pages/Settings'

function RequireProfile({ children }: { children: ReactNode }) {
  const hasProfile = useData((s) => !!s.profile)
  return hasProfile ? children : <Navigate to="/onboarding" replace />
}

export default function App() {
  const theme = useData((s) => s.theme)
  const { pathname, hash } = useLocation()
  useAutoSync()

  // New page: start at the top, or at the #section a link points to.
  useEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 50)
    else window.scrollTo(0, 0)
  }, [pathname, hash])

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
        <Route path="/insights" element={<RequireProfile><Insights /></RequireProfile>} />
        <Route path="/craving" element={<RequireProfile><Craving /></RequireProfile>} />
        <Route path="/settings" element={<RequireProfile><Settings /></RequireProfile>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DialogHost />
    </>
  )
}
