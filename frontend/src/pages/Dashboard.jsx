import { useEffect, useState } from 'react'
import { api } from '../api.js'
import StatusCard from '../components/StatusCard.jsx'
import StressHrvCard from '../components/StressHrvCard.jsx'

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

export default function Dashboard() {
  const [crew, setCrew] = useState('c1')
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    setError(null)
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
        Crew ID <input value={crew} onChange={(e) => setCrew(e.target.value)} />
      </label>{' '}
      <button onClick={load}>Refresh</button>
      {error && <div className="card warn">{error}</div>}
      {items?.length === 0 && <p>No readings yet. Log some on the Log page or run a check-in.</p>}
      <div className="grid">{items?.map((x) => (x.parts ? <StressHrvCard key={x.indicator} parts={x.parts} /> : <StatusCard key={x.indicator} {...x} />))}</div>
    </section>
  )
}
