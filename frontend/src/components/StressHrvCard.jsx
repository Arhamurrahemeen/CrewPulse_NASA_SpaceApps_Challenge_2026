import { Baseline, UnusualBadge } from './StatusCard.jsx'

// Stress (self-report) and HRV (device) side by side. Deliberately no combined "stress score":
// there is no validated way to turn HRV into stress, and neither has a cited threshold (no colour).
export default function StressHrvCard({ parts }) {
  return (
    <article className="status-card none">
      <header>
        <h2>Stress &amp; HRV</h2>
        <span className="badges">
          {parts.map((p) => <UnusualBadge key={p.indicator} b={p.baseline} />)}
        </span>
      </header>
      <div className="pair">
        {parts.map((p) => (
          <div key={p.indicator}>
            <div className="muted">{p.label}</div>
            <div className="big">
              {p.value} <span>{p.unit}</span>
            </div>
            <div className="muted">
              {new Date(p.ts).toLocaleString()} · <span className="badge">{p.source}</span>
            </div>
            <Baseline b={p.baseline} unit={p.unit} />
          </div>
        ))}
      </div>
      <p className="muted">
        Shown together for context only: no cited threshold for either, and no validated way to turn HRV into a stress level.
        Watch your own trend; if stress stays high, consider contacting flight surgeons.
      </p>
    </article>
  )
}
