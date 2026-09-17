import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from './Icons'

export default function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  // Opened directly from a bookmark there is no in-app history to go back to.
  const back = () => (location.key === 'default' ? navigate('/', { replace: true }) : navigate(-1))
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <button className="press -ml-2 flex size-10 items-center justify-center rounded-full" onClick={back} aria-label="Back">
        <ArrowLeft size={24} />
      </button>
      <h1 className="text-xl font-bold">{title}</h1>
      {action ?? <div className="size-10" />}
    </header>
  )
}
