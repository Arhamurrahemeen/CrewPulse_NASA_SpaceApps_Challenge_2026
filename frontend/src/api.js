export const API = 'http://localhost:8000'
export { indicators as INDICATORS } from '../../backend/rules/thresholds.json'

export async function api(path, options) {
  let res
  try {
    res = await fetch(API + path, options)
  } catch {
    throw new Error('Backend not reachable on localhost:8000.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = body.detail
    throw new Error(Array.isArray(d) ? d.map((x) => (typeof x === 'string' ? x : x.msg)).join(' · ') : d ?? `HTTP ${res.status}`)
  }
  return body
}
