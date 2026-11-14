const STATUS_TEXT = { green: 'In range', amber: 'Check', red: 'Attention' }

// Guidance for one reading. status null = no cited threshold, so no colour and no advice.
export default function GuidancePanel({ status, band, guidance, escalate }) {
  if (!status) return <p className="guidance muted">{band}. Value recorded for trends only.</p>
  return (
    <div className={`guidance ${status}`}>
      <strong>
        {STATUS_TEXT[status]}: {band}
      </strong>
      <p>{guidance}</p>
      {escalate && <p className="escalate">Contact flight surgeons.</p>}
    </div>
  )
}
