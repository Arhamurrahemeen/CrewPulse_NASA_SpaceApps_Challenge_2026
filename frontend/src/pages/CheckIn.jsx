import { useState } from 'react'
import { api, INDICATORS } from '../api.js'

const [HR_MIN, HR_MAX] = INDICATORS.heart_rate.limits

// Oximeter HR read when the scan ends, saved with the scan's timestamp -> exact pair for tools/validate.py.
function OximeterPair({ crew, cameraTs }) {
  const [bpm, setBpm] = useState('')
  const [msg, setMsg] = useState(null)

  async function save(e) {
    e.preventDefault()
    try {
      await api('/checkin/oximeter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_id: crew, camera_ts: cameraTs, bpm: Number(bpm) }),
      })
      setMsg({ ok: `Oximeter ${bpm} bpm saved with this scan.` })
    } catch (err) {
      setMsg({ error: err.message })
    }
  }

  if (msg?.ok) return <div className="muted">{msg.ok}</div>
  return (
    <form className="field" onSubmit={save}>
      <span>Oximeter HR at end of scan</span>
      <input type="number" min={HR_MIN} max={HR_MAX} step={1} required value={bpm} onChange={(e) => setBpm(e.target.value)} />
      <span className="unit">bpm</span>
      <button type="submit">Save pair</button>
      {msg?.error && <div className="card warn">{msg.error}</div>}
    </form>
  )
}

export default function CheckIn() {
  const [crew, setCrew] = useState('c1')
  const [state, setState] = useState('idle') // idle | scanning | done | error
  const [result, setResult] = useState(null)

  async function scan() {
    setState('scanning')
    setResult(null)
    try {
      setResult(await api(`/checkin?crew_id=${encodeURIComponent(crew)}`, { method: 'POST' }))
      setState('done')
    } catch (e) {
      setResult({ error: e.message })
      setState('error')
    }
  }

  return (
    <section className="checkin">
      <h1>Camera check-in</h1>
      <p className="muted">
        Face the camera in even light and keep still. The camera starts, then scans for 30 s. Heart rate only.
        Press q in the camera window to cancel. Wearing a pulse oximeter? Note its heart rate when the scan
        ends and save it below the result — those pairs measure how accurate the camera is.
      </p>
      <label>
        Crew ID <input value={crew} onChange={(e) => setCrew(e.target.value)} disabled={state === 'scanning'} />
      </label>
      <button onClick={scan} disabled={state === 'scanning' || !crew}>
        {state === 'scanning' ? 'Scanning… keep still (~45 s)' : 'Start check-in'}
      </button>

      {state === 'done' && result.accepted && (
        <div className="card">
          <div className="big">{result.bpm} <span>bpm</span></div>
          <div className="muted">
            Signal quality {result.quality_db} dB · {result.fps_measured} fps · saved as camera reading
          </div>
          <OximeterPair key={result.ts} crew={crew} cameraTs={result.ts} />
        </div>
      )}
      {state === 'done' && !result.accepted && (
        <div className="card warn">
          {result.message}
          {!result.cancelled && <div className="muted">Quality {result.quality_db} dB · {result.fps_measured} fps</div>}
        </div>
      )}
      {state === 'error' && <div className="card warn">Check-in failed: {result.error}</div>}
    </section>
  )
}
