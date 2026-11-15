// 3D "vitals field": each lane is one indicator, each point a reading plotted as σ (z-score) from the crew
// member's own baseline mean and SD (the same numbers the baseline engine reports). Adapted from Abdul Awwal's
// HeroField design (OmniteX, CrewPulse design package) to real data: x is real time, lanes without a ready
// baseline are left out, and a square marks a point outside ±2σ (one point alone is not an alert).
import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Html, Line, OrbitControls } from '@react-three/drei'

const C = { tx: '#e8e6e1', tx2: '#8a8d93', hair: '#2c3036', accent: '#ff4f00', amber: '#e8b23a', data: '#5fb3f9', ink: '#0a0b0d' }
const XW = 170, ZS = 44, FLOOR = -92, YS = 19
const yOf = (z) => Math.max(-4.3, Math.min(4.6, z)) * YS
const DAY = 864e5
const fmt = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } })()

function Lane({ lane, li, L, X, active, k, hover, setHover }) {
  const z = (li - (L - 1) / 2) * ZS
  const pts = useMemo(() => lane.pts.map((p) => [X(p.t), yOf(p.z), z]), [lane, z, X])
  const n = Math.max(2, Math.ceil(pts.length * k))
  const op = active ? 1 : 0.15
  return (
    <group>
      <mesh position={[0, 0, z]}>
        <planeGeometry args={[XW * 2, YS * 4]} />
        <meshBasicMaterial color={C.data} transparent opacity={active ? 0.06 : 0.015} depthWrite={false} side={2} />
      </mesh>
      {[2, -2].map((s) => <Line key={s} points={[[-XW, YS * s, z], [XW, YS * s, z]]} color={C.tx2} lineWidth={1} dashed dashSize={4} gapSize={4} transparent opacity={op * 0.6} />)}
      <Line points={[[-XW, 0, z], [XW, 0, z]]} color={C.hair} lineWidth={1} transparent opacity={op} />
      {pts.length > 1 && <Line points={pts.slice(0, n)} color={active ? C.tx : C.tx2} lineWidth={1.6} transparent opacity={active ? 1 : 0.25} />}
      {lane.pts.map((p, i) => i < n && Math.abs(p.z) > 2 && (
        <group key={i}>
          <Line points={[pts[i], [pts[i][0], FLOOR, z]]} color={C.amber} lineWidth={1} transparent opacity={op * 0.5} />
          <Billboard position={pts[i]}>
            <mesh><planeGeometry args={[7, 7]} /><meshBasicMaterial color={C.ink} /></mesh>
            <Line points={[[-3.5, -3.5, 0.1], [3.5, -3.5, 0.1], [3.5, 3.5, 0.1], [-3.5, 3.5, 0.1], [-3.5, -3.5, 0.1]]} color={C.amber} lineWidth={1.5} transparent opacity={op} />
          </Billboard>
        </group>
      ))}
      {active && pts.map((p, i) => (
        <mesh key={'h' + i} position={p}
          onPointerOver={(e) => { e.stopPropagation(); setHover({ li, i }); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { setHover(null); document.body.style.cursor = '' }}>
          <sphereGeometry args={[5, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {hover?.li === li && (
        <Billboard position={pts[hover.i]}>
          <mesh><planeGeometry args={[8, 8]} /><meshBasicMaterial color={C.accent} /></mesh>
        </Billboard>
      )}
      <Html position={[-XW - 10, 0, z]} style={{ transform: 'translate(-100%,-50%)', pointerEvents: 'none' }}>
        <span className="cp-mono" style={{ color: active ? C.tx : C.tx2, whiteSpace: 'nowrap' }}>{lane.short}</span>
      </Html>
    </group>
  )
}

function Floor({ L, X, t0, t1 }) {
  const ZE = ((L - 1) / 2) * ZS + 26
  const ticks = []
  for (let t = t0; t <= t1; t += 5 * DAY) ticks.push(t)
  return (
    <group>
      {ticks.map((t) => <Line key={t} points={[[X(t), FLOOR, -ZE], [X(t), FLOOR, ZE]]} color={C.hair} lineWidth={1} />)}
      <Line points={[[-XW, FLOOR, -ZE], [XW, FLOOR, -ZE], [XW, FLOOR, ZE], [-XW, FLOOR, ZE], [-XW, FLOOR, -ZE]]} color={C.tx2} lineWidth={1} transparent opacity={0.5} />
      {[-2, 0, 2, 4].map((s) => (
        <Html key={s} position={[-XW - 8, yOf(s), -ZE]} style={{ transform: 'translate(-100%,-50%)', pointerEvents: 'none' }}>
          <span className="cp-mono" style={{ color: C.tx2, whiteSpace: 'nowrap' }}>{s > 0 ? '+' : s < 0 ? '−' : ''}{Math.abs(s)}σ{s ? '' : ' · your mean'}</span>
        </Html>
      ))}
      {ticks.map((t) => (
        <Html key={'l' + t} position={[X(t), FLOOR, ZE + 14]} center style={{ pointerEvents: 'none' }}>
          <span className="cp-mono" style={{ color: C.tx2, whiteSpace: 'nowrap' }}>{fmt(t)}</span>
        </Html>
      ))}
    </group>
  )
}

function Grow({ setK }) {
  useFrame((_, dt) => setK((k) => (k >= 1 ? 1 : Math.min(1, k + dt / 1.4))))
  return null
}

export default function VitalsField({ field, days = 30, isolate = -1 }) {
  const [hover, setHover] = useState(null)
  const [k, setK] = useState(reduced ? 1 : 0)
  useEffect(() => { setK(reduced ? 1 : 0) }, [field])
  const t1 = Date.now(), t0 = t1 - days * DAY
  const X = useMemo(() => (t) => -XW + ((t - t0) / (t1 - t0)) * 2 * XW, [t0, t1])
  const L = field.length
  const hv = hover && field[hover.li]
  const hp = hv && hv.pts[hover.i]
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [-430, 240, 560], fov: 35, near: 1, far: 5000 }} gl={{ antialias: true, alpha: true }} aria-label="3D vitals field: readings as standard deviations from your own baseline">
      {k < 1 && <Grow setK={setK} />}
      <Floor L={L} X={X} t0={t0} t1={t1} />
      {field.map((lane, li) => (
        <Lane key={lane.ind} lane={lane} li={li} L={L} X={X} k={k} active={isolate < 0 || isolate === li} hover={hover} setHover={setHover} />
      ))}
      {hp && (
        <Html position={[X(hp.t), yOf(hp.z), (hover.li - (L - 1) / 2) * ZS]} style={{ transform: 'translate(-50%, calc(-100% - 14px))', pointerEvents: 'none' }}>
          <div className="orbit-tip">
            {hv.short} {hp.v} {hv.unit} · {hp.z >= 0 ? '+' : '−'}{Math.abs(hp.z).toFixed(1)}σ
            <small>{new Date(hp.t).toLocaleString()} · your mean {hv.mean} ± {hv.sd}{hp.sim ? ' · simulated' : ''}</small>
          </div>
        </Html>
      )}
      <OrbitControls makeDefault enableDamping={!reduced} dampingFactor={0.12} enablePan={false} enableZoom={false}
        minPolarAngle={0.15} maxPolarAngle={Math.PI / 2 - 0.06} autoRotate={!reduced && !hover} autoRotateSpeed={0.35} />
    </Canvas>
  )
}
