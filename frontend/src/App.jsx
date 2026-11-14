import { useEffect, useState } from 'react'
import { DEMO } from './api.js'
import Dashboard from './pages/Dashboard.jsx'
import CheckIn from './pages/CheckIn.jsx'
import Log from './pages/Log.jsx'
import Radiation from './pages/Radiation.jsx'
import Environment from './pages/Environment.jsx'
import BodyMap from './pages/BodyMap.jsx'

const PAGES = { Dashboard, CheckIn, Log, Radiation, Environment, BodyMap }
const LABELS = { CheckIn: 'Check-in', BodyMap: 'Body map' }

const current = () => (location.hash.slice(1) in PAGES ? location.hash.slice(1) : 'Dashboard')

export default function App() {
  const [page, setPage] = useState(current)
  useEffect(() => {
    const onHash = () => setPage(current())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const Page = PAGES[page]
  return (
    <>
      <nav>
        <strong>CrewPulse</strong>
        {Object.keys(PAGES).map((p) => (
          <a key={p} href={`#${p}`} aria-current={p === page ? 'page' : undefined}>
            {LABELS[p] ?? p}
          </a>
        ))}
      </nav>
      {DEMO && (
        <p className="demo-banner" role="note">
          Demo: simulated crew data (crew-1 to crew-4) and cached NASA DONKI events. Read-only, no backend, nothing
          you enter is saved.
        </p>
      )}
      <main>
        <Page />
      </main>
    </>
  )
}
