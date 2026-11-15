import { Suspense, lazy, useEffect, useState } from 'react'
import { api, DEMO } from '../api.js'
import SimulatedBadge from '../components/SimulatedBadge.jsx'
import Safe3D from '../components/Safe3D.jsx'

const Body3D = lazy(() => import('../components/Body3D.jsx'))

// Original figure built from basic shapes (viewBox 240 x 440). Keys match BODY_PARTS in backend/main.py.
// Left/right are the crew member's own sides: on the front view their right is on the viewer's left.
const LABELS = {
  head: 'Head', neck: 'Neck', chest: 'Chest', upper_back: 'Upper back', abdomen: 'Abdomen', lower_back: 'Lower back',
  pelvis: 'Pelvis / hips', left_arm: 'Left arm', right_arm: 'Right arm', left_leg: 'Left leg', right_leg: 'Right leg',
}
const SHAPES = {
  head: { el: 'ellipse', cx: 120, cy: 42, rx: 26, ry: 32, dot: [120, 42] },
  neck: { el: 'rect', x: 108, y: 72, width: 24, height: 18, rx: 4, dot: [120, 81] },
  torsoUpper: { d: 'M82 92 Q120 84 158 92 L162 168 L78 168 Z', dot: [120, 130] },
  torsoLower: { d: 'M78 168 L162 168 L158 230 L82 230 Z', dot: [120, 199] },
  pelvis: { d: 'M82 230 L158 230 L162 266 L78 266 Z', dot: [120, 248] },
  armViewerLeft: { d: 'M80 94 L62 100 L40 252 L56 256 L80 140 Z', dot: [60, 178] },
  armViewerRight: { d: 'M160 94 L178 100 L200 252 L184 256 L160 140 Z', dot: [180, 178] },
  legViewerLeft: { d: 'M80 266 L119 266 L114 428 L92 428 Z', dot: [101, 345] },
  legViewerRight: { d: 'M160 266 L121 266 L126 428 L148 428 Z', dot: [139, 345] },
}
const VIEWS = {
  front: { head: 'head', neck: 'neck', torsoUpper: 'chest', torsoLower: 'abdomen', pelvis: 'pelvis',
    armViewerLeft: 'right_arm', armViewerRight: 'left_arm', legViewerLeft: 'right_leg', legViewerRight: 'left_leg' },
  back: { head: 'head', neck: 'neck', torsoUpper: 'upper_back', torsoLower: 'lower_back', pelvis: 'pelvis',
    armViewerLeft: 'left_arm', armViewerRight: 'right_arm', legViewerLeft: 'left_leg', legViewerRight: 'right_leg' },
}
const DAYS = 14

function Shape({ shape }) {
  const { el, dot, d, ...attrs } = shape // eslint-disable-line no-unused-vars
  if (el === 'ellipse') return <ellipse {...attrs} />
  if (el === 'rect') return <rect {...attrs} />
  return <path d={d} />
}

function Figure({ view, selected, onSelect, byPart }) {
  const map = VIEWS[view]
  return (
    <svg className="figure" viewBox="0 0 240 440" role="group" aria-label={`Body map, ${view} view`}>
      {Object.entries(map).map(([shapeKey, part]) => (
        <g
          key={shapeKey} className={`region${selected === part ? ' selected' : ''}`} role="button" tabIndex={0}
          aria-label={`${LABELS[part]}${byPart[part] ? `, ${byPart[part].length} recent` : ''}`} aria-pressed={selected === part}
          onClick={() => onSelect(part)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(part))}
        >
          <title>{LABELS[part]}</title>
          <Shape shape={SHAPES[shapeKey]} />
        </g>
      ))}
      {view === 'back' && <line className="spine" x1={120} y1={92} x2={120} y2={230} />}
      {Object.entries(map).map(([shapeKey, part]) => {
        const list = byPart[part]
        if (!list) return null
        const [x, y] = SHAPES[shapeKey].dot
        const max = Math.max(...list.map((s) => s.severity_1_5))
        return (
          <g key={`dot-${shapeKey}`} className="dot-mark" aria-hidden="true">
            <title>{`${LABELS[part]}: ${list.length} in last ${DAYS} days, highest severity ${max}/5`}</title>
            <circle cx={x} cy={y} r={10} />
            <text x={x} y={y + 4} textAnchor="middle">{max}</text>
          </g>
        )
      })}
      <rect className="scan" x={20} y={2} width={200} height={1.5} />
      <text className="side" x={14} y={436}>{view === 'front' ? 'R' : 'L'}</text>
      <text className="side" x={226} y={436} textAnchor="end">{view === 'front' ? 'L' : 'R'}</text>
    </svg>
  )
}

export default function BodyMap() {
  const [crew, setCrew] = useState(DEMO ? 'crew-1' : 'c1')
  const [view, setView] = useState('front')
  const [mode, setMode] = useState('3d')
  const [selected, setSelected] = useState(null)
  const [severity, setSeverity] = useState(null)
  const [note, setNote] = useState('')
  const [symptoms, setSymptoms] = useState([])
  const [msg, setMsg] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!crew) return
    api(`/symptoms?crew_id=${encodeURIComponent(crew)}&days=${DAYS}`).then(setSymptoms, (e) => setMsg({ error: e.message }))
  }, [crew, reload])

  const byPart = {}
  for (const s of symptoms) (byPart[s.body_part] ??= []).push(s)

  function select(part) {
    setSelected(part)
    setSeverity(null)
    setNote('')
    setMsg(null)
  }

  async function submit(e) {
    e.preventDefault()
    if (!severity) return setMsg({ error: 'Choose a severity from 1 to 5.' })
    try {
      await api('/symptoms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_id: crew, body_part: selected, severity_1_5: severity, note: note || null }),
      })
      setMsg({ ok: `Saved: ${LABELS[selected]}, severity ${severity}/5.` })
      setSelected(null)
      setReload((n) => n + 1)
    } catch (err) {
      setMsg({ error: err.message })
    }
  }

  return (
    <section className="bodymap">
      <div className="kicker"><b>06 · Body map</b><span>tap a region</span><span>front and back</span></div>
      <h1>Where does it hurt?</h1>
      <p className="lede">
        Tap where you feel something and log it. Dots show symptoms from the last {DAYS} days (number = highest severity).
        For monitoring only: if a symptom is severe, getting worse or not going away, contact flight surgeons.
      </p>
      <label>
        Crew ID <input value={crew} onChange={(e) => setCrew(e.target.value)} />
      </label>

      <div className="bodymap-layout">
        <div>
          <div className="body-controls">
            <div className="toggle-group" role="group" aria-label="Figure side">
              {['front', 'back'].map((v) => (
                <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === 'front' ? 'Front' : 'Back'}
                </button>
              ))}
            </div>
            <div className="toggle-group" role="group" aria-label="Figure style">
              <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>3D</button>
              <button aria-pressed={mode === 'flat'} onClick={() => setMode('flat')}>Flat</button>
            </div>
          </div>
          {mode === '3d' ? (
            <div className="body3d crop">
              <Safe3D fallback={<Figure view={view} selected={selected} onSelect={select} byPart={byPart} />}>
                <Suspense fallback={null}>
                  <Body3D view={view} byPart={byPart} selected={selected} onSelect={select} labels={LABELS} />
                </Suspense>
              </Safe3D>
              <span className="body3d-hint mono">Drag to turn · click a region</span>
            </div>
          ) : (
            <Figure view={view} selected={selected} onSelect={select} byPart={byPart} />
          )}
          <label className="field region-pick">
            <span>Or choose a region</span>
            <select value={selected ?? ''} onChange={(e) => e.target.value && select(e.target.value)}>
              <option value="">Select…</option>
              {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}{byPart[k] ? ` (${byPart[k].length} recent)` : ''}</option>)}
            </select>
          </label>
        </div>

        <div>
          {selected ? (
            <form className="card symptom-form" onSubmit={submit}>
              <h2>{LABELS[selected]}</h2>
              <fieldset className="row">
                <legend>Severity</legend>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="mood">
                    <input type="radio" name="severity" checked={severity === n} onChange={() => setSeverity(n)} />
                    {n}
                  </label>
                ))}
                <span className="unit">1 = barely noticeable, 5 = worst</span>
              </fieldset>
              <label className="note">
                <span>Note (optional)</span>
                <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="What it feels like, when it started" />
              </label>
              <div>
                <button type="submit">Save</button>{' '}
                <button type="button" onClick={() => setSelected(null)}>Cancel</button>
              </div>
            </form>
          ) : (
            <p className="muted">Select a body region to log a symptom.</p>
          )}
          {msg?.ok && <div className="card ok">{msg.ok}</div>}
          {msg?.error && <div className="card warn">{msg.error}</div>}

          <h2>Last {DAYS} days</h2>
          {symptoms.length === 0 && <p className="muted">No symptoms logged.</p>}
          <ul className="symptom-list">
            {symptoms.map((s) => (
              <li key={s.id}>
                <strong>{LABELS[s.body_part] ?? s.body_part}</strong> · severity {s.severity_1_5}/5{' '}
                {s.source === 'simulated' && <SimulatedBadge />}
                <div className="muted">{new Date(s.ts).toLocaleString()}</div>
                {s.note && <div>{s.note}</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
