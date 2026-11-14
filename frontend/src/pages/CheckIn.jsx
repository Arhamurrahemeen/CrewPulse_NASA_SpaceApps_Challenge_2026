import { useState } from 'react'
import { api } from '../api.js'

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
        Press q in the camera window to cancel.
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
