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

// Original mark: a pulse trace inside an orbit ellipse.
function Logo() {
  return (
    <svg viewBox="0 0 34 20" aria-hidden="true">
      <ellipse cx="17" cy="10" rx="16" ry="6.5" fill="none" stroke="#2c3036" strokeWidth="1" transform="rotate(-12 17 10)" />
      <polyline className="trace" points="1,11 9,11 12,11 14,5 17,16 20,3 23,13 25,11 33,11" />
    </svg>
  )
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const f = () => setOn(navigator.onLine)
    addEventListener('online', f)
    addEventListener('offline', f)
    return () => { removeEventListener('online', f); removeEventListener('offline', f) }
  }, [])
  return on
}

export default function App() {
  const [page, setPage] = useState(current)
  const online = useOnline()
  useEffect(() => {
    const onHash = () => { setPage(current()); scrollTo({ top: 0 }) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const Page = PAGES[page]
  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <div className="gridlines" aria-hidden="true" />
      <nav className="top">
        <a className="brand" href="#Dashboard"><Logo /> CrewPulse</a>
        {Object.keys(PAGES).map((p, i) => (
          <a key={p} className="link" href={`#${p}`} aria-current={p === page ? 'page' : undefined}>
            <span className="n">0{i + 1}</span>{LABELS[p] ?? p}
          </a>
        ))}
        <span className="link-state" title="CrewPulse works the same with or without a link">
          <i style={online ? undefined : { background: 'var(--amber)', animation: 'none' }} />
          {online ? 'Link up' : 'Offline · local data'}
        </span>
      </nav>
      {DEMO && (
        <p className="demo-banner" role="note">
          Demo · simulated crew data (crew-1 to crew-4) and cached NASA DONKI events · what you log stays in this browser only
          <button className="banner-btn" onClick={() => { try { localStorage.removeItem('crewpulse-demo-v1') } catch { /* blocked */ } location.reload() }}>
            Reset demo
          </button>
        </p>
      )}
      <main key={page}>
        <Page />
      </main>
      <footer className="footer">
        <span>CrewPulse · OmniteX · NASA Space Apps Challenge 2026</span>
        <span>Decision support for monitoring, not diagnosis · not a medical device</span>
        <span>Space-weather data: <a href="https://ccmc.gsfc.nasa.gov/tools/DONKI/" target="_blank" rel="noreferrer">NASA CCMC DONKI</a></span>
      </footer>
    </>
  )
}
