import { Suspense, lazy, useEffect, useState } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api.js'
import SourceLink from '../components/SourceLink.jsx'
import Safe3D from '../components/Safe3D.jsx'
import { CountUp, Section } from '../components/ui.jsx'

const SpaceWeather3D = lazy(() => import('../components/SpaceWeather3D.jsx'))

const TYPES = {
  SEP: { name: 'Solar energetic particles', color: '#e5484d' },
  FLR: { name: 'Solar flare', color: '#e8b23a' },
  CME: { name: 'Coronal mass ejection', color: '#5fb3f9' },
  GST: { name: 'Geomagnetic storm', color: '#b58cff' },
}
const ORDER = ['SEP', 'FLR', 'CME', 'GST']

const fmtAge = (h) => (h < 1 ? 'less than an hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)
const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function DosePanel({ dose, sepCount, missionDays, setMissionDays }) {
  const [lo, hi] = dose.pct_of_limit
  return (
    <section className="card dose">
      <h2>
        Estimated mission dose <span className="badge estimate">ESTIMATE</span>
      </h2>
      <label className="field">
        <span>Mission day</span>
        <input type="number" min={1} max={1000} value={missionDays} onChange={(e) => setMissionDays(e.target.value)} />
      </label>
      <div className="big">
        <CountUp value={`${dose.low_msv}–${dose.high_msv}`} /> <span>mSv</span>
      </div>
      <div className="meter" aria-label={`${lo} to ${hi} percent of the 600 mSv career limit`}>
        <div className="meter-lo" style={{ width: `${Math.min(lo, 100)}%` }} />
        <div className="meter-hi" style={{ left: `${Math.min(lo, 100)}%`, width: `${Math.min(hi, 100) - Math.min(lo, 100)}%` }} />
      </div>
      <p className="muted">
        {lo}–{hi} % of the {dose.career_limit_msv} mSv career limit · {dose.per_day_msv[0]}–{dose.per_day_msv[1]} mSv/day
      </p>
      <p className="muted">{dose.basis}</p>
      {sepCount > 0 && (
        <p className="unusual">
          {sepCount} solar energetic particle event{sepCount > 1 ? 's' : ''} in this window may add dose not included above.
          Check with flight surgeons.
        </p>
      )}
      <SourceLink title={dose.source.title} url={dose.source.url} />
      <br />
      <SourceLink title={dose.limit_source.title} url={dose.limit_source.url} />
    </section>
  )
}

function Strip({ events, start, end }) {
  const data = events.map((e) => ({ t: Date.parse(e.time), y: ORDER.indexOf(e.type), ...e }))
  const t0 = Date.parse(start)
  const t1 = Date.parse(end) + 864e5
  const ticks = Array.from({ length: Math.floor((t1 - t0) / (5 * 864e5)) + 1 }, (_, i) => t0 + i * 5 * 864e5)
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e2126" strokeDasharray="2 4" />
        <XAxis dataKey="t" type="number" scale="time" domain={[t0, t1]} ticks={ticks} tickFormatter={fmtDay} stroke="#8a8d93" fontSize={10} />
        <YAxis dataKey="y" type="number" domain={[-0.5, 3.5]} ticks={[0, 1, 2, 3]} tickFormatter={(i) => ORDER[i]} stroke="#8a8d93" fontSize={10} width={40} reversed />
        <Tooltip
          cursor={false}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="chart-tip">
                <strong>{payload[0].payload.detail}</strong>
                <div>{new Date(payload[0].payload.t).toUTCString()}</div>
              </div>
            ) : null
          }
        />
        {ORDER.map((k) => (
          <Scatter key={k} data={data.filter((d) => d.type === k)} fill={TYPES[k].color} isAnimationActive={false} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  )
}

export default function Radiation() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [missionDays, setMissionDays] = useState(90)
  const [shown, setShown] = useState({ SEP: true, FLR: true, CME: false, GST: true })
  const [busy, setBusy] = useState(false)

  async function load(refresh = false) {
    setBusy(true)
    setError(null)
    try {
      setData(await api(`/radiation?mission_days=${Number(missionDays) || 1}${refresh ? '&refresh=true' : ''}`))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { load() }, [missionDays]) // eslint-disable-line react-hooks/exhaustive-deps

  const events = data?.events.filter((e) => shown[e.type]) ?? []
  const groups = {}
  for (const e of events) (groups[e.time.slice(0, 10)] ??= []).push(e) // events arrive newest first
  const byDay = Object.entries(groups)

  return (
    <section className="radiation">
      <div className="kicker"><b>04 · Radiation</b><span>NASA CCMC DONKI</span><span>cached for offline use</span></div>
      <h1>Radiation &amp; space weather</h1>
      <p className="lede">What the Sun did in the last 30 days, and a rough range for your mission dose. The dose is an estimate from published ISS averages, never a dosimeter reading.</p>
      {error && <div className="card warn">{error}</div>}
      {data && (
        <>
          <p className={data.offline || data.age_hours > 24 ? 'unusual' : 'muted'}>
            {data.offline ? 'Offline: showing cached data. ' : ''}
            Space-weather data fetched {fmtAge(data.age_hours)} ago ({data.start} to {data.end}).{' '}
            <button onClick={() => load(true)} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
          </p>

          <div className="space3d crop">
            <Safe3D fallback={null}>
              <Suspense fallback={null}><SpaceWeather3D counts={data.counts} /></Suspense>
            </Safe3D>
          </div>
          <p className="muted mono" style={{ marginTop: '-0.5rem' }}>Illustration, not to scale: flares flash on the Sun, CMEs travel as shells, SEP particles stream, a storm lights Earth's field. Drag to orbit.</p>

          <DosePanel dose={data.dose} sepCount={data.counts.SEP} missionDays={missionDays} setMissionDays={setMissionDays} />

          <Section num="4.2" title="Event timeline" aside="last 30 days · tap a type to filter" />
          <div className="toggle-group" role="group" aria-label="Event types">
            {ORDER.map((k) => (
              <button key={k} aria-pressed={shown[k]} onClick={() => setShown((s) => ({ ...s, [k]: !s[k] }))}>
                <span className="dot" style={{ background: TYPES[k].color }} /> {TYPES[k].name} ({data.counts[k]})
              </button>
            ))}
          </div>
          <Strip events={events} start={data.start} end={data.end} />

          {byDay.length === 0 && <p className="muted">No events of the selected types in this window.</p>}
          <ol className="timeline">
            {byDay.map(([day, evs]) => (
              <li key={day}>
                <strong>{fmtDay(day)}</strong>
                <ul>
                  {evs.map((e) => (
                    <li key={e.id}>
                      <span className="dot" style={{ background: TYPES[e.type].color }} /> {e.time.slice(11, 16)} UTC · {e.detail}{' '}
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noreferrer">
                          details
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <footer className="credit muted">
            <a href={data.credit.url} target="_blank" rel="noreferrer">{data.credit.text}</a>
          </footer>
        </>
      )}
    </section>
  )
}
