import { Suspense, lazy, useEffect, useState } from 'react'
import { api, DEMO, INDICATORS } from '../api.js'

const [HR_MIN, HR_MAX] = INDICATORS.heart_rate.limits
// Not bundled into the demo build: it needs the local backend for the face model and the analysis.
const BrowserScan = import.meta.env.VITE_DEMO_MODE === 'true' ? null : lazy(() => import('../components/BrowserScan.jsx'))

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

// Animated viewfinder. Illustration only: the real camera runs in the backend's own preview window.
function Scanner({ state }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (state !== 'scanning') return setSecs(0)
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [state])
  const p = Math.min(1, secs / 45)
  return (
    <div className={`scanner ${state}`} aria-hidden="true">
      <svg viewBox="0 0 320 240">
        <defs><linearGradient id="sweep" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5fb3f9" stopOpacity="0" /><stop offset="1" stopColor="#5fb3f9" stopOpacity="0.5" /></linearGradient></defs>
        <ellipse cx="160" cy="112" rx="58" ry="74" className="face" />
        {[[100, 40, 1, 1], [220, 40, -1, 1], [100, 184, 1, -1], [220, 184, -1, -1]].map(([x, y, sx, sy], i) => (
          <path key={i} d={`M${x} ${y + 18 * sy} V${y} H${x + 18 * sx}`} className="bracket" />
        ))}
        <rect x="122" y="52" width="76" height="34" className="roi" />
        <text x="122" y="47" className="roi-label">ROI · forehead</text>
        <rect x="96" y="40" width="128" height="24" fill="url(#sweep)" className="sweep" />
        <polyline className="bvp" points="20,214 60,214 72,214 80,200 88,226 98,190 108,220 116,214 150,214 162,214 170,200 178,226 188,190 198,220 206,214 240,214 252,214 260,200 268,226 278,190 288,220 296,214 300,214" />
        <circle cx="290" cy="30" r="16" className="ring-bg" />
        <circle cx="290" cy="30" r="16" className="ring" style={{ strokeDasharray: 100.5, strokeDashoffset: 100.5 * (1 - p) }} transform="rotate(-90 290 30)" />
        <text x="290" y="34" className="ring-t">{state === 'scanning' ? secs : '30s'}</text>
      </svg>
    </div>
  )
}

export default function CheckIn() {
  const [crew, setCrew] = useState(DEMO ? 'crew-1' : 'c1')
  const [state, setState] = useState('idle') // idle | scanning | done | error
  const [mode, setMode] = useState(null) // 'browser' (camera in this page) | 'window' (desktop OpenCV window)
  const [result, setResult] = useState(null)

  // Download and compile the face tracker while the user reads the page, so Start only waits for the camera.
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE !== 'true') import('../components/BrowserScan.jsx').then((m) => m.warmUp())
  }, [])

  function startBrowser() {
    setResult(null)
    setMode('browser')
    setState('scanning')
  }

  function browserDone(r) {
    if (r === null) return // unmounted
    setResult(r)
    setState(r.error ? 'error' : 'done')
  }

  async function scan() {
    setMode('window')
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
    <section>
      <div className="kicker"><b>02 · Camera check-in</b><span>rPPG · POS method</span><span>heart rate only</span></div>
      <h1>A 30-second pulse reading from your face.</h1>
      <p className="lede">Your camera opens right here and scans for 30 s. Only three colour numbers per frame leave this page, and only to your own local backend: never video. A weak signal means a re-scan, never a number.</p>
      <div className="checkin-layout">
      {state === 'scanning' && mode === 'browser' && BrowserScan ? (
        <Suspense fallback={<Scanner state="scanning" />}>
          <BrowserScan crew={crew} onDone={browserDone} />
        </Suspense>
      ) : (
        <Scanner state={state} />
      )}
      <div className="checkin">
      {DEMO && (
        <div className="card warn">
          Camera check-in is turned off in this online demo: it needs the CrewPulse backend running on your own
          computer, where the camera is read locally and never uploaded. Run the app locally to try it.
        </div>
      )}
      <label>
        Crew ID <input value={crew} onChange={(e) => setCrew(e.target.value)} disabled={DEMO || state === 'scanning'} />
      </label>
      {state === 'scanning' && mode === 'browser' ? (
        <button type="button" onClick={() => { setState('idle'); setMode(null) }}>Cancel scan</button>
      ) : (
        <button type="button" className="btn-primary" onClick={startBrowser} disabled={DEMO || state === 'scanning' || !crew}>
          {state === 'scanning' ? 'Scanning in the camera window… (~45 s)' : 'Start check-in'}
        </button>
      )}
      {!DEMO && state !== 'scanning' && (
        <button type="button" className="link-btn" onClick={scan} disabled={!crew}>
          Or use the desktop camera window (press q there to cancel)
        </button>
      )}

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
      <div className="card">
        <div className="mono muted">Set up for the best reading</div>
        <ul className="guide">
          <li><b>Light</b> Face a window or lamp so the light falls evenly on your face. Nothing bright behind you, no flickering light, no direct glare.</li>
          <li><b>Distance</b> About an arm's length, roughly 40–60 cm, with your whole face in the frame.</li>
          <li><b>Forehead</b> Keep it visible: move hair, caps and headbands out of the box.</li>
          <li><b>Stay still</b> Sit down, rest your elbows, don't talk, and keep your head steady for the full 30 s. Breathe normally.</li>
          <li><b>Camera</b> At eye level, lens clean. Close other apps that use the camera.</li>
          <li><b>Oximeter</b> Wearing one? Type its heart rate under the result: those pairs measure how accurate the camera is.</li>
        </ul>
        <div className="mono muted">Forehead box colour = distance (estimated from face size)</div>
        <div className="legend-row">
          <span className="mark green">Good distance</span>
          <span className="mark amber">Adjust a little</span>
          <span className="mark red">Too close or too far</span>
        </div>
        <div className="mono muted">Note on method</div>
        <p className="serif" style={{ margin: '0.3rem 0 0' }}>
          Remote photoplethysmography reads tiny colour changes in the skin. Accuracy drops with motion, low light and
          darker skin tones, and CrewPulse has not yet been validated against an oximeter. Confirm with the oximeter when it matters.
        </p>
        <a className="source" href="https://doi.org/10.1109/TBME.2016.2609282" target="_blank" rel="noreferrer">Wang et al. 2017, Algorithmic Principles of Remote PPG, IEEE TBME</a>
      </div>
      </div>
      </div>
    </section>
  )
}
