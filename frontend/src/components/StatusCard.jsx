import GuidancePanel from './GuidancePanel.jsx'
import SourceLink from './SourceLink.jsx'
import SimulatedBadge from './SimulatedBadge.jsx'

export default function StatusCard({ label, value, unit, ts, source, status, band, guidance, escalate_to_flight_surgeon, source_title, source_url }) {
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
      {source_url && <SourceLink title={source_title} url={source_url} />}
    </article>
  )
}
