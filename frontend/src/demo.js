// VITE_DEMO_MODE: answers api() calls from the bundled snapshot (backend/sim/export_demo.py), no backend.
// Read-only. Timestamps are shifted so the simulated history always ends "now".
import data from './demo/data.json'

const DAY = 864e5
const shift = Date.now() - Date.parse(data.exported_at)
const moveTs = (x) =>
  Array.isArray(x) ? x.map(moveTs)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'ts' ? new Date(Date.parse(v) + shift).toISOString() : moveTs(v)]))
      : x
const status = moveTs(data.status)
const trends = moveTs(data.trends)
const environment = moveTs(data.environment)

const lastDays = (series, days) => {
  const since = Date.now() - days * DAY
  return series.map((s) => ({ ...s, points: s.points.filter((p) => Date.parse(p.ts) >= since) })).filter((s) => s.points.length)
}
const round1 = (x) => Math.round(x * 10) / 10

function radiation(missionDays) {
  const r = data.radiation
  const [lo, hi] = r.dose_per_day_msv.map((d) => round1(d * missionDays))
  const limit = r.dose.career_limit_msv
  return {
    ...r,
    age_hours: round1((Date.now() - Date.parse(r.fetched_at)) / 36e5),
    dose: { ...r.dose, mission_days: missionDays, low_msv: lo, high_msv: hi, pct_of_limit: [round1((lo / limit) * 100), round1((hi / limit) * 100)] },
  }
}

export const READ_ONLY = 'Demo mode: this public build is a read-only snapshot, so nothing is saved. Run CrewPulse locally to log data or use the camera check-in.'

export function demoApi(path, options) {
  if (options?.method && options.method !== 'GET') throw new Error(READ_ONLY)
  const url = new URL(path, 'http://demo')
  const days = Number(url.searchParams.get('days')) || 30
  const [, route, crew] = url.pathname.split('/').map(decodeURIComponent)
  if (route === 'status') return status[crew] ?? []
  if (route === 'trends') return { days, indicators: lastDays(trends[crew] ?? [], days) }
  if (route === 'environment') {
    const since = Date.now() - days * DAY
    return { ...environment, days, series: lastDays(environment.series, days), rows: environment.rows.filter((r) => Date.parse(r.ts) >= since) }
  }
  if (route === 'radiation') return radiation(Number(url.searchParams.get('mission_days')) || 90)
  throw new Error(`Demo mode: ${url.pathname} is not in the snapshot.`)
}

export const DEMO_CREW = data.crew
