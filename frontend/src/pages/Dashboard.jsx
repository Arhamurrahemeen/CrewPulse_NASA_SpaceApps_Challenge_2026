import { useEffect, useState } from 'react'
import { api, DEMO } from '../api.js'
import StatusCard from '../components/StatusCard.jsx'
import StressHrvCard from '../components/StressHrvCard.jsx'
import TrendChart from '../components/TrendChart.jsx'

const RANK = { red: 3, amber: 2, green: 1 }

// Systolic + diastolic from the same entry become one card showing the worse of the two.
function mergeBp(items) {
  const sys = items.find((x) => x.indicator === 'bp_systolic')
  const dia = items.find((x) => x.indicator === 'bp_diastolic')
  if (!sys || !dia || sys.ts !== dia.ts) return items
  const worse = (RANK[dia.status] ?? 0) > (RANK[sys.status] ?? 0) ? dia : sys
  const bp = { ...worse, label: 'Blood pressure', value: `${sys.value}/${dia.value}` }
  return items.flatMap((x) => (x === sys ? [bp] : x === dia ? [] : [x]))
}

// Self-reported stress and device HRV share one card (no combined score).
function mergeStressHrv(items) {
  const parts = items.filter((x) => x.indicator === 'stress' || x.indicator === 'hrv_rmssd')
  if (!parts.length) return items
  const at = items.indexOf(parts[0])
  const rest = items.filter((x) => !parts.includes(x))
  return [...rest.slice(0, at), { indicator: 'stress_hrv', parts }, ...rest.slice(at)]
}

const RANGES = [7, 30, 90]

// Latest cabin values next to the health cards; colour only where thresholds.json cites bands.
function CabinPanel({ reload }) {
  const [latest, setLatest] = useState(null)
  useEffect(() => {
    api('/environment?days=1').then((d) => setLatest(d.latest), () => setLatest(null))
  }, [reload])
  return (
    <aside className="cabin card">
      <h2>
        Cabin <a href="#Environment">log</a>
      </h2>
      {!latest?.length && <p className="muted">No cabin readings yet.</p>}
      <ul>
        {latest?.map((x) => (
          <li key={x.indicator} className={x.status ?? ''} title={x.band}>
            <span>{x.label}</span>
            <strong>
              {x.value} <small className="unit">{x.unit}</small>
            </strong>
            <small className="muted">{new Date(x.ts).toLocaleString()}{x.source === 'simulated' ? ' · simulated' : ''}</small>
          </li>
        ))}
      </ul>
    </aside>
  )
}

// One chart per indicator with readings in the chosen window. `reload` changes on every Refresh.
function Trends({ crew, reload }) {
  const [days, setDays] = useState(30)
  const [series, setSeries] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!crew) return
    setError(null)
    api(`/trends/${encodeURIComponent(crew)}?days=${days}`)
      .then((d) => setSeries(d.indicators))
      .catch((e) => setError(e.message))
  }, [crew, days, reload])

  return (
    <section className="trends">
      <h2>Trends</h2>
      <div className="toggle-group" role="group" aria-label="Time range">
        {RANGES.map((d) => (
          <button key={d} aria-pressed={d === days} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>
      {error && <div className="card warn">{error}</div>}
      {series?.length === 0 && <p className="muted">No readings in the last {days} days.</p>}
      <div className="trend-grid">{series?.map((s) => <TrendChart key={s.indicator} series={s} days={days} />)}</div>
    </section>
  )
}

export default function Dashboard() {
  const [crew, setCrew] = useState(DEMO ? 'crew-1' : 'c1')
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState({ crew: null, n: 0 })

  async function load() {
    setError(null)
    setLoaded((l) => ({ crew, n: l.n + 1 }))
    try {
      setItems(mergeStressHrv(mergeBp(await api(`/status/${encodeURIComponent(crew)}`))))
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <h1>Dashboard</h1>
      <p className="muted">Latest reading per indicator. Monitoring and decision support only.</p>
      <label>
        Crew ID <input value={crew} onChange={(e) => setCrew(e.target.value)} list="crew-ids" />
      </label>{' '}
      {DEMO && <datalist id="crew-ids">{['crew-1', 'crew-2', 'crew-3', 'crew-4'].map((c) => <option key={c} value={c} />)}</datalist>}
      <button onClick={load}>Refresh</button>
      {error && <div className="card warn">{error}</div>}
      {items?.length === 0 && <p>No readings yet. Log some on the Log page or run a check-in.</p>}
      <div className="with-aside">
        <div className="grid">{items?.map((x) => (x.parts ? <StressHrvCard key={x.indicator} parts={x.parts} /> : <StatusCard key={x.indicator} {...x} />))}</div>
        <CabinPanel reload={loaded.n} />
      </div>
      <Trends crew={loaded.crew} reload={loaded.n} />
    </section>
  )
}
