import GuidancePanel from './GuidancePanel.jsx'
import SourceLink from './SourceLink.jsx'
import SimulatedBadge from './SimulatedBadge.jsx'
import { CountUp } from './ui.jsx'

const fmt = (x) => (x > 0 ? '+' : '') + x

// Personal baseline (statistics on this crew member's own history, not a medical threshold).
export const UnusualBadge = ({ b }) =>
  b?.reasons?.length > 0 ? <span className="badge unusual-badge" title={b.reasons.join(' · ')}>Unusual for you</span> : null

export function Baseline({ b, unit }) {
  if (!b) return null
  if (!b.ready) return <p className="baseline muted">Building your baseline: {b.n_days}/{b.min_days} days of history.</p>
  return (
    <div className="baseline">
      <div className="muted">
        Your {b.window_days}-day baseline: {b.mean} ± {b.sd} {unit}
        {b.z != null && <> · today z = {fmt(b.z)}</>}
        {b.z_prev != null && <>, yesterday z = {fmt(b.z_prev)}</>}
        {b.slope_per_day != null && <> · 7-day trend {fmt(b.slope_per_day)} {unit}/day</>}
      </div>
      {b.reasons?.length > 0 && (
        <ul className="reasons">
          {b.reasons.map((r) => <li key={r}>{r}</li>)}
          <li>Consider a re-check and keep monitoring.</li>
        </ul>
      )}
    </div>
  )
}

export default function StatusCard({ label, value, unit, ts, source, status, band, guidance, escalate_to_flight_surgeon, source_title, source_url, baseline, i = 0 }) {
  return (
    <article className={`status-card reveal ${status ?? 'none'}`} style={{ '--i': i }}>
      <header>
        <h2>{label}</h2>
        <span className="badges">
          <UnusualBadge b={baseline} />
          {source === 'simulated' ? <SimulatedBadge /> : <span className="badge">{source}</span>}
        </span>
      </header>
      <div className="big">
        <CountUp value={value} /> <span>{unit}</span>
      </div>
      <div className="muted">{new Date(ts).toLocaleString()}</div>
      <GuidancePanel status={status} band={band} guidance={guidance} escalate={escalate_to_flight_surgeon} />
      <Baseline b={baseline} unit={unit} />
      {source_url && <SourceLink title={source_title} url={source_url} />}
    </article>
  )
}
