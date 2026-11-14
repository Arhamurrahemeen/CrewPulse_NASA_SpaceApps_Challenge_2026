import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import SimulatedBadge from './SimulatedBadge.jsx'
import SourceLink from './SourceLink.jsx'
import { INDICATORS } from '../api.js'

// Same colours as the CSS tokens (SVG attributes get literal values).
const BAND_FILL = { green: '#3fb950', amber: '#d29922', red: '#f85149' }
const LINE = '#5fb3f9'
const SIM = '#9aa4ae'
const DAY_MS = 864e5

const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Real readings: filled dot. Simulated: hollow grey dot.
function Dot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null
  return payload.source === 'simulated'
    ? <circle cx={cx} cy={cy} r={3.5} fill="none" stroke={SIM} strokeWidth={1.5} />
    : <circle cx={cx} cy={cy} r={3.5} fill={LINE} stroke="#0f1419" strokeWidth={1} />
}

function Tip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="chart-tip">
      <strong>{p.value} {unit}</strong>
      <div>{new Date(p.t).toLocaleString()}</div>
      <div>{p.source}</div>
    </div>
  )
}

export default function TrendChart({ series, days }) {
  const { label, unit, bands, points, source_title, source_url } = series
  const data = points.map((p) => ({ t: Date.parse(p.ts), value: p.value, source: p.source }))
  const now = Date.now()
  const values = data.map((d) => d.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.2, Math.abs(hi) * 0.05, 1)
  // Axis never shows physically impossible values (e.g. SpO₂ above 100 %).
  const [minOk, maxOk] = INDICATORS[series.indicator].limits
  const yDomain = [Math.max(minOk, Math.floor(lo - pad)), Math.min(maxOk, Math.ceil(hi + pad))]
  const hasSim = data.some((d) => d.source === 'simulated')

  return (
    <figure className="trend">
      <figcaption>
        <strong>{label}</strong> <span className="muted">({unit}, last {days} days)</span> {hasSim && <SimulatedBadge />}
      </figcaption>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {bands.map((b) => (
            <ReferenceArea key={b.from} y1={b.from} y2={b.to} fill={BAND_FILL[b.status]} fillOpacity={0.18} ifOverflow="hidden" />
          ))}
          <CartesianGrid stroke="#2a3139" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" scale="time" domain={[now - days * DAY_MS, now]} tickFormatter={fmtDate} stroke="#9aa4ae" fontSize={11} />
          <YAxis domain={yDomain} stroke="#9aa4ae" fontSize={11} width={40} allowDataOverflow />
          <Tooltip content={<Tip unit={unit} />} />
          <Line dataKey="value" stroke={LINE} strokeWidth={1.5} dot={<Dot />} activeDot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="muted chart-note">
        {bands.length ? 'Shading: cited green / amber / red ranges. ' : 'No cited threshold, so no shading. '}
        {hasSim && 'Hollow grey dots are simulated. '}
        {source_url && <SourceLink title={source_title} url={source_url} />}
      </div>
    </figure>
  )
}
