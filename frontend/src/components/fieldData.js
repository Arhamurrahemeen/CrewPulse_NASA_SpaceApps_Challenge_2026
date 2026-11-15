// Data for the 3D vitals field (kept apart from the three.js code so it can load lazily).
export const CHANNELS = [
  ['heart_rate', 'HR'], ['bp_systolic', 'BP SYS'], ['glucose_fasting', 'GLU'], ['body_temp', 'TEMP'],
  ['spo2', 'SPO₂'], ['sleep_hours', 'SLEEP'], ['mood', 'MOOD'],
]

// series: /trends indicators; status: raw /status items (baseline mean/sd per indicator)
export function buildField(series, status) {
  const base = Object.fromEntries(status.map((x) => [x.indicator, x]))
  return CHANNELS.flatMap(([ind, short]) => {
    const s = series.find((x) => x.indicator === ind)
    const b = base[ind]?.baseline
    if (!s || !b?.ready || !b.sd) return []
    const pts = s.points.map((p) => ({ t: Date.parse(p.ts), v: p.value, z: (p.value - b.mean) / b.sd, sim: p.source === 'simulated' }))
    return [{ ind, short, unit: s.unit, mean: b.mean, sd: b.sd, pts }]
  })
}
