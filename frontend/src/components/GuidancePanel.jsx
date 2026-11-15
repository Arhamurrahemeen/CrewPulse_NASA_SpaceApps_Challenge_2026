import { StatusMark } from './ui.jsx'

// Guidance for one reading. status null = no cited threshold, so no colour and no advice.
export default function GuidancePanel({ status, band, guidance, escalate }) {
  if (!status) return <div className="guidance"><StatusMark status={null} /><p className="muted">{band}. Value recorded for trends only.</p></div>
  return (
    <div className="guidance">
      <StatusMark status={status}>{`${{ green: 'In range', amber: 'Check', red: 'Attention' }[status]} · ${band}`}</StatusMark>
      <p>{guidance}</p>
      {escalate && <p className="escalate">■ Contact flight surgeons</p>}
    </div>
  )
}
