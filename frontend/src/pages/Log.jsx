import { useState } from 'react'
import { api, INDICATORS } from '../api.js'

// Form rows in display order. step: 1 for whole-number indicators, else decimals.
const ROWS = [['heart_rate'], ['bp_systolic', 'bp_diastolic'], ['glucose_fasting'], ['body_temp'], ['spo2'], ['sleep_hours'], ['hrv_rmssd']]
const STEP = { body_temp: 0.1, sleep_hours: 0.25, hrv_rmssd: 0.1 }

function NumberField({ id, value, onChange }) {
  const s = INDICATORS[id]
  const [lo, hi] = s.limits
  return (
    <label className="field">
      <span>{s.label}</span>
      <input
        type="number" inputMode="decimal" min={lo} max={hi} step={s.integer ? 1 : STEP[id] ?? 1}
        value={value ?? ''} onChange={(e) => onChange(id, e.target.value)}
      />
      <span className="unit">{s.unit}</span>
      <small className="muted">{lo}–{hi}</small>
    </label>
  )
}

function Scale({ id, from, to, hint, value, onChange }) {
  return (
    <fieldset className="row">
      <legend>{INDICATORS[id].label}</legend>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => (
        <label key={n} className="mood">
          <input type="radio" name={id} checked={value === n} onChange={() => onChange(id, n)} />
          {n}
        </label>
      ))}
      <span className="unit">{INDICATORS[id].unit} ({hint})</span>
    </fieldset>
  )
}

export default function Log() {
  const [crew, setCrew] = useState('c1')
  const [values, setValues] = useState({})
  const [hrFromOximeter, setHrFromOximeter] = useState(false)
  const [msg, setMsg] = useState(null)

  const set = (id, v) => setValues((old) => ({ ...old, [id]: v }))

  async function submit(e) {
    e.preventDefault()
    const readings = Object.entries(values)
      .filter(([, v]) => v !== '' && v != null)
      .map(([indicator, v]) => ({
        indicator,
        value: Number(v),
        // SpO₂ only exists via an oximeter; HR depends on the toggle.
        source: indicator === 'spo2' || (indicator === 'heart_rate' && hrFromOximeter) ? 'oximeter' : 'manual',
      }))
    if (!readings.length) return setMsg({ error: 'Enter at least one reading.' })
    try {
      const r = await api('/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_id: crew, readings }),
      })
      setMsg({ ok: `Saved ${r.saved} reading${r.saved > 1 ? 's' : ''} at ${new Date(r.ts).toLocaleTimeString()}.` })
      setValues({})
    } catch (err) {
      setMsg({ error: err.message })
    }
  }

  return (
    <form className="log" onSubmit={submit}>
      <div className="kicker"><b>03 · Log</b><span>manual entry</span><span>saved on this device</span></div>
      <h1>Log what you measured.</h1>
      <p className="lede">Empty fields are skipped. Blood pressure needs both numbers. Each value is checked against cited ranges after you save.</p>
      <label className="field">
        <span>Crew ID</span>
        <input value={crew} onChange={(e) => setCrew(e.target.value)} required />
      </label>

      {ROWS.map((row) => (
        <fieldset key={row[0]} className="row">
          {row.map((id) => <NumberField key={id} id={id} value={values[id]} onChange={set} />)}
          {row[0] === 'heart_rate' && (
            <label className="toggle">
              <input type="checkbox" checked={hrFromOximeter} onChange={(e) => setHrFromOximeter(e.target.checked)} />
              From oximeter
            </label>
          )}
          {row[0] === 'spo2' && <small className="muted">Recorded as oximeter</small>}
          {row[0] === 'hrv_rmssd' && <small className="muted">RMSSD from a chest-strap ECG or similar device, not the camera</small>}
        </fieldset>
      ))}

      <Scale id="mood" from={1} to={5} hint="1 = very low, 5 = very good" value={values.mood} onChange={set} />
      <Scale id="stress" from={0} to={10} hint="how stressed do you feel right now? 0 = not at all, 10 = extremely" value={values.stress} onChange={set} />

      <button type="submit">Save</button>
      {msg?.ok && <div className="card ok">{msg.ok}</div>}
      {msg?.error && <div className="card warn">{msg.error}</div>}
    </form>
  )
}
