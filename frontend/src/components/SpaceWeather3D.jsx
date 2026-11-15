// Radiation page scene: Sun → Earth, animated from the cached DONKI counts. An illustration, not to scale and
// not a physical model: flares flash on the Sun, CMEs travel outward as shells, a geomagnetic storm makes
// Earth's field lines glow, and SEP events stream particles. Zero events of a type means none are drawn.
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, Line, OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'

const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } })()
const SUN = [-4.2, 0, 0], EARTH = [4.2, 0, 0]

function Sun({ flares }) {
  const spots = useRef([])
  const dirs = useMemo(() => Array.from({ length: Math.min(flares, 14) }, (_, i) => {
    const a = i * 2.399, y = 1 - (i + 0.5) / Math.max(1, Math.min(flares, 14)) * 2
    const r = Math.sqrt(1 - y * y)
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(1.42)
  }), [flares])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    spots.current.forEach((m, i) => {
      if (!m) return
      const p = (t * 0.45 + i * 0.37) % 1
      const s = reduced ? 0.6 : Math.max(0, Math.sin(p * Math.PI)) * 1.2
      m.scale.setScalar(0.05 + s * 0.25)
      m.material.opacity = reduced ? 0.8 : 0.9 * Math.sin(p * Math.PI)
    })
  })
  return (
    <group position={SUN}>
      <mesh><sphereGeometry args={[1.4, 64, 64]} /><meshBasicMaterial color="#ff7a1a" /></mesh>
      <mesh><sphereGeometry args={[1.62, 48, 48]} /><meshBasicMaterial color="#ff4f00" transparent opacity={0.18} depthWrite={false} /></mesh>
      <mesh><sphereGeometry args={[2.1, 48, 48]} /><meshBasicMaterial color="#ff4f00" transparent opacity={0.06} depthWrite={false} /></mesh>
      {dirs.map((d, i) => (
        <mesh key={i} position={d} ref={(m) => (spots.current[i] = m)}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#fff2b0" transparent depthWrite={false} />
        </mesh>
      ))}
      <pointLight intensity={60} distance={30} color="#ffb070" />
    </group>
  )
}

function Cmes({ n }) {
  const shells = useRef([])
  const k = Math.min(n, 6)
  useFrame(({ clock }) => {
    shells.current.forEach((m, i) => {
      if (!m) return
      const p = reduced ? 0.5 : (clock.elapsedTime * 0.12 + i / k) % 1
      m.position.x = SUN[0] + 1.5 + p * 6.2
      m.scale.setScalar(0.4 + p * 2.2)
      m.material.opacity = 0.32 * (1 - p)
    })
  })
  return Array.from({ length: k }, (_, i) => (
    <mesh key={i} ref={(m) => (shells.current[i] = m)} rotation={[0, Math.PI / 2, 0]}>
      <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3]} />
      <meshBasicMaterial color="#5fb3f9" transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  ))
}

function Particles({ on }) {
  const ref = useRef()
  const N = 500
  const seed = useMemo(() => Float32Array.from({ length: N * 3 }, () => Math.random()), [])
  const pos = useMemo(() => new Float32Array(N * 3), [])
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime
    for (let i = 0; i < N; i++) {
      const p = (seed[i * 3] + t * (0.08 + seed[i * 3 + 1] * 0.1)) % 1
      pos[i * 3] = SUN[0] + 1.4 + p * 7
      pos[i * 3 + 1] = (seed[i * 3 + 1] - 0.5) * (0.6 + p * 2.4)
      pos[i * 3 + 2] = (seed[i * 3 + 2] - 0.5) * (0.6 + p * 2.4)
    }
    if (ref.current) ref.current.geometry.attributes.position.needsUpdate = true
  })
  if (!on) return null
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial color="#e5484d" size={0.04} transparent opacity={0.8} depthWrite={false} />
    </points>
  )
}

function Earth({ storm }) {
  const lines = useMemo(() => Array.from({ length: 10 }, (_, j) => {
    const L = 1.3 + (j % 5) * 0.45, rot = (j / 10) * Math.PI * 2
    return Array.from({ length: 41 }, (_, i) => {
      const th = 0.25 + (i / 40) * (Math.PI - 0.5)
      const r = L * Math.sin(th) ** 2
      const x = r * Math.sin(th), y = r * Math.cos(th)
      return [x * Math.cos(rot) * (Math.cos(rot) < 0 ? 1.8 : 0.8), y, x * Math.sin(rot)]
    })
  }), [])
  const glow = useRef()
  useFrame(({ clock }) => {
    if (glow.current) glow.current.material.opacity = storm ? 0.25 + (reduced ? 0 : Math.sin(clock.elapsedTime * 2) * 0.15) : 0.08
  })
  return (
    <group position={EARTH}>
      <mesh><sphereGeometry args={[0.55, 48, 48]} /><meshStandardMaterial color="#123a63" roughness={0.8} /></mesh>
      <mesh ref={glow}><sphereGeometry args={[0.7, 32, 32]} /><meshBasicMaterial color={storm ? '#b58cff' : '#5fb3f9'} transparent depthWrite={false} /></mesh>
      {lines.map((p, i) => <Line key={i} points={p} color={storm ? '#b58cff' : '#5fb3f9'} lineWidth={1} transparent opacity={storm ? 0.55 : 0.25} />)}
    </group>
  )
}

export default function SpaceWeather3D({ counts }) {
  const label = (pos, text) => (
    <Html position={pos} center style={{ pointerEvents: 'none' }}><span className="cp-mono" style={{ color: '#8a8d93', whiteSpace: 'nowrap' }}>{text}</span></Html>
  )
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 3.2, 11], fov: 40 }} gl={{ antialias: true, alpha: true }} aria-label="Illustration: Sun to Earth, animated from the last 30 days of DONKI events">
      <ambientLight intensity={0.2} />
      <Stars radius={60} depth={30} count={1800} factor={2.5} saturation={0} fade speed={reduced ? 0 : 0.4} />
      <Sun flares={counts.FLR ?? 0} />
      <Cmes n={counts.CME ?? 0} />
      <Particles on={(counts.SEP ?? 0) > 0} />
      <Earth storm={(counts.GST ?? 0) > 0} />
      {label([SUN[0], -2.3, 0], `Sun · ${counts.FLR ?? 0} flares`)}
      {label([0, -1.6, 0], `${counts.CME ?? 0} CMEs · ${counts.SEP ?? 0} SEP`)}
      {label([EARTH[0], -1.4, 0], `Earth · ${counts.GST ?? 0} storms`)}
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={!reduced} autoRotateSpeed={0.25} minPolarAngle={Math.PI * 0.25} maxPolarAngle={Math.PI * 0.62} />
    </Canvas>
  )
}
