import { useEffect, useState } from 'react'
import { api, ENVIRONMENT } from '../api.js'
import StatusCard from '../components/StatusCard.jsx'
import TrendChart from '../components/TrendChart.jsx'

// ppm is a volume fraction; partial pressure = fraction x total pressure. ASSUMPTION: 1 atm (760 mmHg) cabin,
// the ISS nominal. A lower-pressure habitat gives a lower ppCO2 for the same ppm.
const CABIN_MMHG = 760
const ppmToMmhg = (ppm) => Math.round((ppm * CABIN_MMHG) / 1e5) / 10

function Field({ id, value, onChange, step, children }) {
  const s = ENVIRONMENT[id]
  return (
    <label className="field">
      <span>{s.label}</span>
      <input type="number" inputMode="decimal" min={0} step={step} value={value ?? ''} onChange={(e) => onChange(id, e.target.value)} />
      {children ?? <span className="unit">{s.unit}</span>}
    </label>
  )
}

export default function Environment() {
  const [values, setValues] = useState({})
  const [co2Unit, setCo2Unit] = useState('mmHg')
  const [msg, setMsg] = useState(null)
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    api(`/environment?days=${days}`).then(setData, (e) => setMsg({ error: e.message }))
  }, [days, reload])

  const set = (id, v) => setValues((old) => ({ ...old, [id]: v }))
  const co2 = values.co2_mmhg === '' || values.co2_mmhg == null ? null : Number(values.co2_mmhg)
  const co2Mmhg = co2 == null ? null : co2Unit === 'ppm' ? ppmToMmhg(co2) : co2

  async function submit(e) {
    e.preventDefault()
    const body = Object.fromEntries(
      Object.entries({ ...values, co2_mmhg: co2Mmhg }).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, Number(v)]),
    )
    if (!Object.keys(body).length) return setMsg({ error: 'Enter at least one value.' })
    try {
      const r = await api('/environment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setMsg({ ok: `Saved cabin reading at ${new Date(r.ts).toLocaleTimeString()}.` })
      setValues({})
      setReload((n) => n + 1)
    } catch (err) {
      setMsg({ error: err.message })
    }
  }

  return (
    <section>
      <h1>Cabin environment</h1>
      <form className="log" onSubmit={submit}>
        <p className="muted">Log what the cabin displays show; empty fields are skipped. Shared by the whole crew.</p>
        <Field id="co2_mmhg" value={values.co2_mmhg} onChange={set} step={co2Unit === 'ppm' ? 1 : 0.1}>
          <select value={co2Unit} onChange={(e) => setCo2Unit(e.target.value)} aria-label="CO₂ unit">
            <option>mmHg</option>
            <option>ppm</option>
          </select>
          {co2Unit === 'ppm' && co2Mmhg != null && (
            <small className="muted">≈ {co2Mmhg} mmHg at a 1 atm (760 mmHg) cabin</small>
          )}
        </Field>
        <Field id="temp_c" value={values.temp_c} onChange={set} step={0.1} />
        <Field id="humidity_pct" value={values.humidity_pct} onChange={set} step={1} />
        <button type="submit">Save</button>
        {msg?.ok && <div className="card ok">{msg.ok}</div>}
        {msg?.error && <div className="card warn">{msg.error}</div>}
      </form>

      <h2>Latest</h2>
      {data?.latest.length === 0 && <p className="muted">No cabin readings yet.</p>}
      <p className="muted">
        CO₂ limit is a 1-hour average; one reading above it is a prompt to re-check, not proof the average is exceeded.
      </p>
      <div className="grid">{data?.latest.map((x) => <StatusCard key={x.indicator} {...x} source="manual" />)}</div>

      <h2>Trends</h2>
      <div className="toggle-group" role="group" aria-label="Time range">
        {[7, 30, 90].map((d) => (
          <button key={d} aria-pressed={d === days} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>
      {data?.series.length === 0 && <p className="muted">No cabin readings in the last {days} days.</p>}
      <div className="trend-grid">{data?.series.map((s) => <TrendChart key={s.indicator} series={s} days={days} />)}</div>
    </section>
  )
}
