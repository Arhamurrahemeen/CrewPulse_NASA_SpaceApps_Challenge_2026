import { useEffect, useState } from 'react'

const WORD = { green: 'In range', amber: 'Check', red: 'Attention' }

// Status is always shape + word (● ▲ ■ ○), never colour alone.
export function StatusMark({ status, children }) {
  return <span className={`mark ${status ?? 'none'}`}>{children ?? WORD[status] ?? 'No cited threshold'}</span>
}

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// Counts every number inside a value ("105/77", "36.5") up from zero, keeping its decimals.
export function CountUp({ value, ms = 900 }) {
  const text = String(value ?? '')
  const [k, setK] = useState(reduced() ? 1 : 0)
  useEffect(() => {
    if (reduced()) return setK(1)
    let raf, start
    const step = (t) => {
      start ??= t
      const p = Math.min(1, (t - start) / ms)
      setK(1 - Math.pow(1 - p, 3))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    setK(0)
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, ms])
  return text.replace(/-?\d+(\.\d+)?/g, (m) => {
    const d = (m.split('.')[1] || '').length
    return (Number(m) * k).toFixed(d)
  })
}

export function Section({ num, title, aside, children }) {
  return (
    <>
      <div className="sec">
        <span className="num">{num}</span>
        <h2>{title}</h2>
        {aside && <span className="aside">{aside}</span>}
      </div>
      {children}
    </>
  )
}
