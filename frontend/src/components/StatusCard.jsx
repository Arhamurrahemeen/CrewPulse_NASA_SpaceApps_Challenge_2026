import GuidancePanel from './GuidancePanel.jsx'
import SourceLink from './SourceLink.jsx'
import SimulatedBadge from './SimulatedBadge.jsx'

const fmt = (x) => (x > 0 ? '+' : '') + x

// Personal baseline (statistics on this crew member's own history, not a medical threshold).
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
      {b.unusual && <p className="unusual">Unusual vs your baseline two days in a row. Consider a re-check.</p>}
      {b.trend && <p className="unusual">Steady {b.slope_per_day > 0 ? 'rise' : 'fall'} over the last 7 days. Keep monitoring.</p>}
    </div>
  )
}

export default function StatusCard({ label, value, unit, ts, source, status, band, guidance, escalate_to_flight_surgeon, source_title, source_url, baseline }) {
  return (
    <article className={`status-card ${status ?? 'none'}`}>
      <header>
        <h2>{label}</h2>
        {source === 'simulated' ? <SimulatedBadge /> : <span className="badge">{source}</span>}
      </header>
      <div className="big">
        {value} <span>{unit}</span>
      </div>
      <div className="muted">{new Date(ts).toLocaleString()}</div>
      <GuidancePanel status={status} band={band} guidance={guidance} escalate={escalate_to_flight_surgeon} />
      <Baseline b={baseline} unit={unit} />
      {source_url && <SourceLink title={source_title} url={source_url} />}
    </article>
  )
}
