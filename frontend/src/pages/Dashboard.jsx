import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { api, DEMO } from '../api.js'
import StatusCard from '../components/StatusCard.jsx'
import StressHrvCard from '../components/StressHrvCard.jsx'
import TrendChart from '../components/TrendChart.jsx'
import Safe3D from '../components/Safe3D.jsx'
import { Section } from '../components/ui.jsx'
import { buildField, CHANNELS } from '../components/fieldData.js'

const OrbitScene = lazy(() => import('../components/OrbitScene.jsx'))
const VitalsField = lazy(() => import('../components/VitalsField.jsx'))

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

// Headline from cited statuses only; "unusual for you" comes from the personal baseline.
function headline(items) {
  if (!items?.length) return { h: <>No readings <em>yet</em>.</>, sub: 'Log a reading or run a camera check-in to start your baseline.' }
  const flat = items.flatMap((x) => x.parts ?? [x])
  const red = flat.filter((x) => x.status === 'red').length
  const amber = flat.filter((x) => x.status === 'amber').length
  const unusual = flat.filter((x) => x.baseline?.reasons?.length).length
  const uncited = flat.filter((x) => !x.status).length
  // Emphasis takes the status colour (orange stays reserved for actions).
  const h = red ? <><em className="red">{red}</em> reading{red > 1 ? 's' : ''} need{red > 1 ? '' : 's'} attention.</>
    : amber ? <><em className="amber">{amber}</em> reading{amber > 1 ? 's' : ''} to check.</>
      : <>All cited readings <em className="green">in range</em>.</>
  const last = flat.reduce((a, x) => (x.ts > a ? x.ts : a), '')
  const sub = [unusual ? `${unusual} unusual for you` : 'nothing unusual for you', `${uncited} without a cited threshold`, `last reading ${new Date(last).toLocaleString()}`].join(' · ')
  return { h, sub }
}

function Field({ crew, status, reload }) {
  const [series, setSeries] = useState(null)
  const [iso, setIso] = useState(-1)
  useEffect(() => {
    if (!crew) return
    api(`/trends/${encodeURIComponent(crew)}?days=30`).then((d) => setSeries(d.indicators), () => setSeries([]))
  }, [crew, reload])
  const field = useMemo(() => (series && status ? buildField(series, status) : []), [series, status])
  if (!series) return null
  if (!field.length) return <p className="muted">The field appears once at least one indicator has a 7-day baseline.</p>
  return (
    <>
      <div className="field-channels" role="group" aria-label="Isolate a channel">
        <button aria-pressed={iso < 0} onClick={() => setIso(-1)}>All</button>
        {field.map((l, i) => <button key={l.ind} aria-pressed={iso === i} onClick={() => setIso(iso === i ? -1 : i)}>{l.short}</button>)}
      </div>
      <div className="field3d crop">
        <Safe3D fallback={<p className="muted" style={{ padding: '1rem' }}>3D view unavailable on this device; the trend charts below show the same readings.</p>}>
          <Suspense fallback={null}><VitalsField field={field} isolate={iso} /></Suspense>
        </Safe3D>
      </div>
      <div className="field-legend">
        <span>Lane = one indicator · height = σ from your own mean</span>
        <span>Dashed = ±2σ, your usual band</span>
        <span style={{ color: 'var(--amber)' }}>□ outside your band (one point alone is not an alert)</span>
        <span>Drag to orbit · hover a point</span>
      </div>
    </>
  )
}

export default function Dashboard() {
  const [crew, setCrew] = useState(DEMO ? 'crew-1' : 'c1')
  const [raw, setRaw] = useState(null)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState({ crew: null, n: 0 })

  async function load() {
    setError(null)
    setLoaded((l) => ({ crew, n: l.n + 1 }))
    try {
      setRaw(await api(`/status/${encodeURIComponent(crew)}`))
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => (raw ? mergeStressHrv(mergeBp(raw)) : null), [raw])
  const orbit = useMemo(() => (raw ?? []).filter((x) => CHANNELS.some(([c]) => c === x.indicator) || x.indicator === 'bp_diastolic'), [raw])
  const { h, sub } = headline(items)

  return (
    <section>
      <div className="hero">
        <div className="hero-canvas">
          <div className="hero-fallback" />
          <Safe3D fallback={null}>
            <Suspense fallback={null}><OrbitScene items={orbit} /></Suspense>
          </Safe3D>
        </div>
        <div className="hero-hud" aria-hidden="true">
          <span className="hud-chip">Crew <b>{loaded.crew ?? crew}</b></span>
          <span className="hud-chip">Orbit inclination <b>51.6°</b> · ISS-class</span>
          <span className="hud-chip">Baseline <b>28 d · ±2 SD · 2 days</b></span>
          <span className="hud-chip">Satellites = your vitals · <b>tap one</b></span>
        </div>
        <div className="hero-copy">
          <div className="kicker"><b>01 · Self-check</b><span>Monitoring, not diagnosis</span><span>Works offline</span></div>
          <h1>{error ? <>Can't reach the <em>local store</em>.</> : h}</h1>
          <p className="lede">{error ?? sub}</p>
          <div className="hero-actions">
            <a className="btn-primary" href="#CheckIn">Begin camera check-in →</a>
            <a href="#Log">Log readings</a>
            <a href="#BodyMap">Body map</a>
          </div>
        </div>
      </div>

      <Section num="1.1" title="Instruments" aside="colour only where a guideline is cited">
        <label className="mono">
          Crew ID <input value={crew} onChange={(e) => setCrew(e.target.value)} list="crew-ids" style={{ width: '9rem', marginLeft: '0.5rem' }} />
        </label>{' '}
        {DEMO && <datalist id="crew-ids">{['crew-1', 'crew-2', 'crew-3', 'crew-4'].map((c) => <option key={c} value={c} />)}</datalist>}
        <button onClick={load}>Refresh</button>
        {items?.length === 0 && <p className="muted">No readings yet. Log some on the Log page or run a check-in.</p>}
        <div className="with-aside">
          <div className="grid">{items?.map((x, i) => (x.parts ? <StressHrvCard key={x.indicator} parts={x.parts} i={i} /> : <StatusCard key={x.indicator} {...x} i={i} />))}</div>
          <CabinPanel reload={loaded.n} />
        </div>
      </Section>

      <Section num="1.2" title="Vitals field" aside="30 days · σ from your own baseline · 3D">
        <Field crew={loaded.crew} status={raw} reload={loaded.n} />
      </Section>

      <Section num="1.3" title="Trends" aside="7 / 30 / 90 days · cited bands shaded">
        <Trends crew={loaded.crew} reload={loaded.n} />
      </Section>
    </section>
  )
}
