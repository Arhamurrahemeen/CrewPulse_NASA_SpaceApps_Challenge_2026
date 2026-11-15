// VITE_DEMO_MODE: answers api() calls with no backend. Reads come from public/demo.json (backend/sim/export_demo.py),
// shifted so the simulated history always ends "now". Writes (log, cabin, body map) are kept in THIS browser only
// (localStorage) and merged into the reads, so the public demo is interactive without a server or shared data.
// Colours come from the same thresholds.json as the backend (evaluate/bands are ports of backend/rules/engine.py).
import { ENVIRONMENT, INDICATORS } from './api.js'

const DAY = 864e5
const KEY = 'crewpulse-demo-v1'
const SPECS = { ...INDICATORS, ...ENVIRONMENT }
const BODY_PARTS = ['head', 'neck', 'chest', 'upper_back', 'abdomen', 'lower_back', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg']

const loaded = fetch(`${import.meta.env.BASE_URL}demo.json`)
  .then((r) => {
    if (!r.ok) throw new Error(`Demo data not found (HTTP ${r.status}).`)
    return r.json()
  })
  .then((data) => {
    const shift = Date.now() - Date.parse(data.exported_at)
    const moveTs = (x) =>
      Array.isArray(x) ? x.map(moveTs)
        : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'ts' ? new Date(Date.parse(v) + shift).toISOString() : moveTs(v)]))
          : x
    return { ...moveTs({ status: data.status, trends: data.trends, environment: data.environment, symptoms: data.symptoms }), crew: data.crew, radiation: data.radiation }
  })

// ---------- this browser's own entries ----------
function store() {
  try { return { readings: [], environment: [], symptoms: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { readings: [], environment: [], symptoms: [] } }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { throw new Error('This browser blocks local storage, so demo entries cannot be kept.') }
}
export function resetDemo() {
  try { localStorage.removeItem(KEY) } catch { /* nothing stored */ }
}
export function demoEntryCount() {
  const s = store()
  return s.readings.length + s.environment.length + s.symptoms.length
}

// ---------- ports of backend/rules/engine.py ----------
function evaluate(ind, value) {
  const spec = SPECS[ind]
  for (const b of spec.bands ?? []) {
    if (!('below' in b) || value < b.below) {
      return { status: b.status, band: b.label, guidance: b.guidance, escalate_to_flight_surgeon: b.escalate_to_flight_surgeon, source_title: spec.source_title, source_url: spec.source_url }
    }
  }
  return { status: null, band: 'No cited threshold yet', guidance: null, escalate_to_flight_surgeon: false, source_title: null, source_url: null }
}
function bands(ind) {
  const spec = SPECS[ind]
  const [lo, hi] = spec.limits
  let start = lo
  return (spec.bands ?? []).map((b) => {
    const end = b.below ?? hi
    const out = { from: start, to: end, status: b.status, label: b.label }
    start = end
    return out
  })
}
function checkValue(ind, v, table) {
  const spec = table[ind]
  if (!spec) return `unknown indicator ${ind}`
  const [lo, hi] = spec.limits
  if (!(v >= lo && v <= hi)) return `${spec.label} must be ${lo}-${hi} ${spec.unit}`
  if (spec.integer && v !== Math.trunc(v)) return `${spec.label} must be a whole number`
  return null
}

// A new entry compared with the snapshot's personal baseline (mean ± SD stay those of the simulated history).
function baselineFor(prev, value, ts, unit) {
  const b = prev?.baseline
  if (!b?.ready || !b.sd) return b ?? { window_days: 28, n_days: 1, min_days: 7, ready: false, reasons: [] }
  const z = Math.round(((value - b.mean) / b.sd) * 100) / 100
  const prevDay = prev.ts.slice(0, 10) !== ts.slice(0, 10)
  const zPrev = prevDay ? b.z ?? null : b.z_prev ?? null
  const unusual = zPrev != null && Math.abs(z) >= 2 && Math.abs(zPrev) >= 2 && Math.sign(z) === Math.sign(zPrev)
  const f = (x) => (x > 0 ? '+' : '') + x.toFixed(1)
  const reasons = unusual ? [`${z > 0 ? 'Above' : 'Below'} your usual range two days in a row (yesterday z ${f(zPrev)}, today z ${f(z)}; usual ${b.mean.toFixed(1)} ± ${b.sd.toFixed(1)} ${unit})`] : []
  return { ...b, z, z_prev: zPrev, unusual, reasons, slope_per_day: null, trend: null }
}

const lastDays = (series, days) => {
  const since = Date.now() - days * DAY
  return series.map((s) => ({ ...s, points: s.points.filter((p) => Date.parse(p.ts) >= since) })).filter((s) => s.points.length)
}
const round1 = (x) => Math.round(x * 10) / 10

function radiation(r, missionDays) {
  const [lo, hi] = r.dose_per_day_msv.map((d) => round1(d * missionDays))
  const limit = r.dose.career_limit_msv
  return {
    ...r,
    age_hours: round1((Date.now() - Date.parse(r.fetched_at)) / 36e5),
    dose: { ...r.dose, mission_days: missionDays, low_msv: lo, high_msv: hi, pct_of_limit: [round1((lo / limit) * 100), round1((hi / limit) * 100)] },
  }
}

// ---------- writes ----------
function postReadings(body) {
  const errors = []
  const by = {}
  for (const r of body.readings ?? []) {
    const e = checkValue(r.indicator, r.value, INDICATORS)
    if (e) errors.push(e)
    else by[r.indicator] = r.value
    if (r.source === 'oximeter' && !['heart_rate', 'spo2'].includes(r.indicator)) errors.push(`${r.indicator} cannot come from an oximeter`)
  }
  if (('bp_systolic' in by) !== ('bp_diastolic' in by)) errors.push('Enter both systolic and diastolic blood pressure')
  else if ('bp_systolic' in by && by.bp_systolic <= by.bp_diastolic) errors.push('Systolic must be higher than diastolic')
  if (!body.crew_id) errors.push('Crew ID is required')
  if (errors.length) throw new Error(errors.join(' · '))
  const ts = new Date().toISOString()
  const s = store()
  for (const r of body.readings) s.readings.push({ id: `d${Date.now()}${r.indicator}`, crew_id: body.crew_id, ts, indicator: r.indicator, value: r.value, unit: INDICATORS[r.indicator].unit, source: r.source ?? 'manual', quality: null })
  save(s)
  return { saved: body.readings.length, ts }
}

function postEnvironment(body) {
  const values = {}
  for (const [k, v] of Object.entries(body)) {
    if (v == null || !(k in ENVIRONMENT)) continue
    const spec = ENVIRONMENT[k]
    values[k] = spec.integer ? Math.round(v) : Number(v.toFixed(spec.decimals ?? 1))
  }
  if (!Object.keys(values).length) throw new Error('Enter at least one value.')
  const errors = Object.entries(values).map(([k, v]) => checkValue(k, v, ENVIRONMENT)).filter(Boolean)
  if (errors.length) throw new Error(errors.join(' · '))
  const ts = new Date().toISOString()
  const s = store()
  s.environment.push({ id: `e${Date.now()}`, ts, ...values })
  save(s)
  return { ts, values }
}

function postSymptom(body) {
  if (!body.crew_id) throw new Error('Crew ID is required')
  if (!BODY_PARTS.includes(body.body_part)) throw new Error('Unknown body region')
  if (!Number.isInteger(body.severity_1_5) || body.severity_1_5 < 1 || body.severity_1_5 > 5) throw new Error('Severity must be 1 to 5')
  if ((body.note ?? '').length > 500) throw new Error('Note must be 500 characters or fewer')
  const ts = new Date().toISOString()
  const s = store()
  s.symptoms.push({ id: `s${Date.now()}`, crew_id: body.crew_id, ts, body_part: body.body_part, severity_1_5: body.severity_1_5, note: (body.note ?? '').trim() || null })
  save(s)
  return { id: s.symptoms.at(-1).id, ts }
}

// ---------- reads (snapshot + this browser's entries) ----------
function statusFor(snapshot, crew) {
  const latest = Object.fromEntries((snapshot[crew] ?? []).map((x) => [x.indicator, x]))
  for (const r of store().readings.filter((r) => r.crew_id === crew)) {
    const prev = latest[r.indicator]
    latest[r.indicator] = { ...r, label: INDICATORS[r.indicator].label, ...evaluate(r.indicator, r.value), baseline: baselineFor(prev, r.value, r.ts, r.unit) }
  }
  return Object.keys(INDICATORS).filter((k) => latest[k]).map((k) => latest[k])
}

function trendsFor(snapshot, crew, days) {
  const series = (snapshot[crew] ?? []).map((s) => ({ ...s, points: [...s.points] }))
  for (const r of store().readings.filter((r) => r.crew_id === crew)) {
    let s = series.find((x) => x.indicator === r.indicator)
    if (!s) {
      const spec = INDICATORS[r.indicator]
      s = { indicator: r.indicator, label: spec.label, unit: spec.unit, bands: bands(r.indicator), source_title: spec.source_title ?? null, source_url: spec.source_url ?? null, points: [] }
      series.push(s)
    }
    s.points.push({ ts: r.ts, value: r.value, source: r.source })
  }
  return lastDays(series, days)
}

function environmentFor(env, days) {
  const mine = store().environment
  const latest = Object.fromEntries(env.latest.map((x) => [x.indicator, x]))
  const series = env.series.map((s) => ({ ...s, points: [...s.points] }))
  for (const row of mine) {
    for (const ind of Object.keys(ENVIRONMENT)) {
      if (row[ind] == null) continue
      const spec = ENVIRONMENT[ind]
      latest[ind] = { indicator: ind, label: spec.label, unit: spec.unit, value: row[ind], ts: row.ts, source: 'manual', ...evaluate(ind, row[ind]) }
      let s = series.find((x) => x.indicator === ind)
      if (!s) { s = { indicator: ind, label: spec.label, unit: spec.unit, bands: bands(ind), source_title: spec.source_title, source_url: spec.source_url, points: [] }; series.push(s) }
      s.points.push({ ts: row.ts, value: row[ind], source: 'manual' })
    }
  }
  const since = Date.now() - days * DAY
  const myRows = mine.slice().reverse().map((r) => ({
    id: r.id, ts: r.ts, source: 'manual',
    ...Object.fromEntries(Object.keys(ENVIRONMENT).map((k) => [k, r[k] == null ? null : { value: r[k], status: evaluate(k, r[k]).status }])),
  }))
  return {
    days,
    latest: Object.keys(ENVIRONMENT).filter((k) => latest[k]).map((k) => latest[k]),
    series: lastDays(series, days),
    rows: [...myRows, ...env.rows].filter((r) => Date.parse(r.ts) >= since).slice(0, 50),
  }
}

export const READ_ONLY = 'Demo mode: the camera check-in needs the CrewPulse backend on your own computer. Run the app locally to try it.'

export async function demoApi(path, options) {
  const { status, trends, environment, symptoms, radiation: rad } = await loaded
  const url = new URL(path, 'http://demo')
  const [, route, crew] = url.pathname.split('/').map(decodeURIComponent)
  if (options?.method && options.method !== 'GET') {
    const body = options.body ? JSON.parse(options.body) : {}
    if (route === 'readings') return postReadings(body)
    if (route === 'environment') return postEnvironment(body)
    if (route === 'symptoms') return postSymptom(body)
    throw new Error(READ_ONLY)
  }
  const days = Number(url.searchParams.get('days')) || 30
  if (route === 'status') return statusFor(status, crew)
  if (route === 'trends') return { days, indicators: trendsFor(trends, crew, days) }
  if (route === 'environment') return environmentFor(environment, days)
  if (route === 'symptoms') {
    const id = url.searchParams.get('crew_id')
    const since = Date.now() - days * DAY
    const mine = store().symptoms.filter((s) => s.crew_id === id).reverse()
    return [...mine, ...(symptoms[id] ?? [])].filter((s) => Date.parse(s.ts) >= since)
  }
  if (route === 'radiation') return radiation(rad, Number(url.searchParams.get('mission_days')) || 90)
  throw new Error(`Demo mode: ${url.pathname} is not in the snapshot.`)
}
