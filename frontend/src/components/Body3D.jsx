// 3D body map: an original figure built from primitives, styled as a scan hologram. Region keys match BODY_PARTS
// in backend/main.py. The torso is one shape per level; front or back (chest/upper back, abdomen/lower back) is
// decided by where the click lands. Left/right are the crew member's own sides (figure faces the camera at rest).
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

const C = { base: '#1d232b', hover: '#5fb3f9', selected: '#ff4f00', wire: '#5fb3f9', tx2: '#8a8d93' }
const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } })()

// [key, region (string, or [front, back]), geometry, position, rotation, scale]
const PARTS = [
  ['head', 'head', ['sphere', [0.34, 32, 32]], [0, 2.5, 0]],
  ['neck', 'neck', ['cyl', [0.12, 0.15, 0.3, 20]], [0, 2.1, 0]],
  ['torsoUp', ['chest', 'upper_back'], ['capsule', [0.42, 0.42, 8, 24]], [0, 1.58, 0], [0, 0, 0], [1.22, 1, 0.68]],
  ['torsoLow', ['abdomen', 'lower_back'], ['capsule', [0.36, 0.2, 8, 24]], [0, 0.98, 0], [0, 0, 0], [1.1, 1, 0.7]],
  ['pelvis', 'pelvis', ['capsule', [0.38, 0.08, 8, 24]], [0, 0.52, 0], [0, 0, 0], [1.12, 0.85, 0.74]],
  ['armR', 'right_arm', ['capsule', [0.13, 1.1, 8, 16]], [-0.67, 1.3, 0], [0, 0, -0.1]],
  ['armL', 'left_arm', ['capsule', [0.13, 1.1, 8, 16]], [0.67, 1.3, 0], [0, 0, 0.1]],
  ['shR', 'right_arm', ['sphere', [0.17, 24, 24]], [-0.6, 1.86, 0]],
  ['shL', 'left_arm', ['sphere', [0.17, 24, 24]], [0.6, 1.86, 0]],
  ['handR', 'right_arm', ['sphere', [0.12, 16, 16]], [-0.74, 0.6, 0.02]],
  ['handL', 'left_arm', ['sphere', [0.12, 16, 16]], [0.74, 0.6, 0.02]],
  ['footR', 'right_leg', ['sphere', [0.15, 16, 16]], [-0.27, -1.2, 0.1], [0, 0, 0], [1, 0.55, 1.7]],
  ['footL', 'left_leg', ['sphere', [0.15, 16, 16]], [0.27, -1.2, 0.1], [0, 0, 0], [1, 0.55, 1.7]],
  ['legR', 'right_leg', ['capsule', [0.17, 1.25, 8, 16]], [-0.26, -0.42, 0], [0, 0, 0.02]],
  ['legL', 'left_leg', ['capsule', [0.17, 1.25, 8, 16]], [0.26, -0.42, 0], [0, 0, -0.02]],
]
// Where a region's dot sits (local coordinates; back regions on the back).
export const ANCHOR = {
  head: [0, 2.55, 0.33], neck: [0, 2.1, 0.16], chest: [0, 1.62, 0.3], upper_back: [0, 1.62, -0.3],
  abdomen: [0, 0.98, 0.26], lower_back: [0, 0.98, -0.26], pelvis: [0, 0.5, 0.28],
  right_arm: [-0.72, 1.15, 0.14], left_arm: [0.72, 1.15, 0.14], right_leg: [-0.27, -0.45, 0.18], left_leg: [0.27, -0.45, 0.18],
}

function Geo({ g }) {
  const [kind, args] = g
  if (kind === 'sphere') return <sphereGeometry args={args} />
  if (kind === 'cyl') return <cylinderGeometry args={args} />
  return <capsuleGeometry args={args} />
}

function Part({ def, group, hover, selected, setHover, onSelect, labels }) {
  const [key, region, g, pos, rot = [0, 0, 0], scale = [1, 1, 1]] = def
  const pick = (e) => {
    if (typeof region === 'string') return region
    const p = group.current.worldToLocal(e.point.clone())
    return p.z >= 0 ? region[0] : region[1]
  }
  const regions = typeof region === 'string' ? [region] : region
  const on = (r) => regions.includes(r)
  const color = on(selected) ? C.selected : on(hover) ? C.hover : C.base
  return (
    <group position={pos} rotation={rot} scale={scale}>
      <mesh
        onPointerMove={(e) => { e.stopPropagation(); const r = pick(e); if (r !== hover) setHover(r); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHover(null); document.body.style.cursor = '' }}
        onClick={(e) => { e.stopPropagation(); onSelect(pick(e)) }}
        userData={{ key }}
      >
        <Geo g={g} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.15} emissive={color} emissiveIntensity={color === C.base ? 0 : 0.25} />
      </mesh>
      <mesh raycast={() => null}>
        <Geo g={g} />
        <meshBasicMaterial color={C.wire} wireframe transparent opacity={0.1} />
      </mesh>
      {hover && on(hover) && (
        <Html center position={[0, 0, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <div className="orbit-tip">{labels[hover]}</div>
        </Html>
      )}
    </group>
  )
}

function Scan() {
  const ring = useRef()
  useFrame(({ clock }) => {
    if (reduced) return
    ring.current.position.y = 1.0 + Math.sin(clock.elapsedTime * 0.9) * 2.0
  })
  return (
    <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
      <torusGeometry args={[1.05, 0.006, 8, 96]} />
      <meshBasicMaterial color={C.wire} transparent opacity={0.55} />
    </mesh>
  )
}

function Figure({ view, byPart, selected, onSelect, labels }) {
  const group = useRef()
  const [hover, setHover] = useState(null)
  const target = view === 'back' ? Math.PI : 0
  useFrame((_, dt) => {
    const g = group.current
    g.rotation.y += (target - g.rotation.y) * Math.min(1, dt * (reduced ? 60 : 5))
  })
  return (
    <group ref={group}>
      {PARTS.map((d) => <Part key={d[0]} def={d} group={group} hover={hover} selected={selected} setHover={setHover} onSelect={onSelect} labels={labels} />)}
      {Object.entries(byPart).map(([part, list]) => ANCHOR[part] && (
        <group key={part} position={ANCHOR[part]}>
          <mesh raycast={() => null}><sphereGeometry args={[0.09, 16, 16]} /><meshBasicMaterial color={C.selected} /></mesh>
          <Html center occlude style={{ pointerEvents: 'none' }} zIndexRange={[15, 0]}>
            <span className="body-dot">{Math.max(...list.map((s) => s.severity_1_5))}</span>
          </Html>
        </group>
      ))}
    </group>
  )
}

function Platform() {
  const rings = useMemo(() => [0.6, 0.95, 1.3], [])
  return (
    <group position={[0, -1.32, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map((r) => (
        <mesh key={r} raycast={() => null}><ringGeometry args={[r, r + 0.008, 96]} /><meshBasicMaterial color={C.wire} transparent opacity={0.35} side={THREE.DoubleSide} /></mesh>
      ))}
    </group>
  )
}

export default function Body3D({ view, byPart, selected, onSelect, labels }) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 1.0, 7.6], fov: 36 }} gl={{ antialias: true, alpha: true }} aria-label="3D body map: drag to turn, click a region to log a symptom">
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} color="#fff2e6" />
      <directionalLight position={[-4, 2, -4]} intensity={0.7} color="#5fb3f9" />
      <Figure view={view} byPart={byPart} selected={selected} onSelect={onSelect} labels={labels} />
      <Scan />
      <Platform />
      <OrbitControls target={[0, 0.65, 0]} enableZoom={false} enablePan={false} minPolarAngle={Math.PI * 0.3} maxPolarAngle={Math.PI * 0.62} />
    </Canvas>
  )
}
