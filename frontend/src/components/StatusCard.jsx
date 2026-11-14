import SourceLink from './SourceLink.jsx'
import SimulatedBadge from './SimulatedBadge.jsx'

const STATUS_TEXT = { green: 'In range', amber: 'Check', red: 'Attention' }

export default function StatusCard({ label, value, unit, ts, source, status, band, guidance, escalate, source_title, source_url }) {
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
      <p>
        <strong>{status ? `${STATUS_TEXT[status]}: ${band}` : band}</strong>
        {guidance && <> — {guidance}</>}
      </p>
      {escalate && <p className="escalate">Contact flight surgeons.</p>}
      {source_url && <SourceLink title={source_title} url={source_url} />}
    </article>
  )
}
