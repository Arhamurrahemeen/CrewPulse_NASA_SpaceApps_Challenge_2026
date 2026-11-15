// Dashboard hero: an original, procedural scene (no textures, no network, no NASA marks).
// Earth from a noise field, a station on a 51.6° orbit (the ISS inclination), a floating astronaut built from
// primitives, and the crew member's latest vitals as satellites coloured by their cited status.
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, Line, OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'

const C = { tx: '#e8e6e1', tx2: '#8a8d93', accent: '#ff4f00', data: '#5fb3f9', green: '#3fb68b', amber: '#e8b23a', red: '#e5484d' }
const STATUS = { green: C.green, amber: C.amber, red: C.red }
const WORD = { green: 'In range', amber: 'Check', red: 'Attention' }
const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } })()
const SPEED = reduced ? 0 : 1

function landPoints(n = 9000, r = 2.012) {
  const out = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const th = golden * i
    const x = Math.cos(th) * rad
    const z = Math.sin(th) * rad
    const lat = Math.asin(y)
    const lon = Math.atan2(z, x)
    const f = Math.sin(lon * 2 + Math.sin(lat * 3) * 1.3) * Math.cos(lat * 2.6) + 0.5 * Math.sin(lon * 5.1 + lat * 4.2) + 0.25 * Math.cos(lon * 9 - lat * 7)
    if (f > 0.5 && Math.abs(lat) < 1.3) out.push(x * r, y * r, z * r)
  }
  return new Float32Array(out)
}

const atmosphere = () => new THREE.ShaderMaterial({
  uniforms: { c: { value: new THREE.Color(C.data) } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6); gl_FragColor = vec4(c, f * 0.85); }',
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
})

function Earth() {
  const g = useRef()
  const land = useMemo(() => landPoints(), [])
  const atmo = useMemo(atmosphere, [])
  useFrame((_, dt) => { g.current.rotation.y += dt * 0.05 * SPEED })
  return (
    <group rotation={[0.41, 0, 0]}>
      <group ref={g}>
        <mesh>
          <sphereGeometry args={[2, 64, 64]} />
          <meshStandardMaterial color="#0b1e33" roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.004, 36, 18]} />
          <meshBasicMaterial color={C.data} wireframe transparent opacity={0.07} />
        </mesh>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[land, 3]} />
          </bufferGeometry>
          <pointsMaterial color={C.tx} size={0.03} transparent opacity={0.85} sizeAttenuation />
        </points>
      </group>
      <mesh material={atmo}>
        <sphereGeometry args={[2.18, 64, 64]} />
      </mesh>
    </group>
  )
}

function Station() {
  const orbit = useRef()
  const blink = useRef()
  const ring = useMemo(() => Array.from({ length: 129 }, (_, i) => {
    const a = (i / 128) * Math.PI * 2
    return [Math.cos(a) * 3.15, 0, Math.sin(a) * 3.15]
  }), [])
  useFrame(({ clock }, dt) => {
    orbit.current.rotation.y += dt * 0.22 * SPEED
    if (blink.current) blink.current.visible = Math.sin(clock.elapsedTime * 4) > 0.6
  })
  return (
    <group rotation={[0, 0, (51.6 * Math.PI) / 180]}>
      <Line points={ring} color={C.tx2} lineWidth={1} dashed dashSize={0.08} gapSize={0.08} transparent opacity={0.45} />
      <group ref={orbit}>
        <group position={[3.15, 0, 0]} scale={0.11} rotation={[0, 0, Math.PI / 2]}>
          <mesh><boxGeometry args={[7, 0.25, 0.25]} /><meshStandardMaterial color="#9aa0a8" metalness={0.6} roughness={0.4} /></mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0, s * 0.9]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.35, 0.35, 1.8, 16]} />
              <meshStandardMaterial color={C.tx} metalness={0.3} roughness={0.5} />
            </mesh>
          ))}
          {[-3, -2, 2, 3].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.9, 0.04, 2.6]} />
              <meshStandardMaterial color="#1c3556" emissive="#0d2240" metalness={0.8} roughness={0.25} />
            </mesh>
          ))}
          <mesh ref={blink} position={[3.5, 0.3, 0]}><sphereGeometry args={[0.12, 8, 8]} /><meshBasicMaterial color={C.accent} /></mesh>
        </group>
      </group>
    </group>
  )
}

function Astronaut() {
  const g = useRef()
  const white = <meshStandardMaterial color="#ecebe6" roughness={0.55} />
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * SPEED
    g.current.position.y = -1.55 + Math.sin(t * 0.8) * 0.12
    g.current.rotation.z = 0.25 + Math.sin(t * 0.5) * 0.08
    g.current.rotation.y = -0.5 + Math.sin(t * 0.3) * 0.25
  })
  return (
    <group ref={g} position={[4.6, -1.55, 0.6]} scale={0.32}>
      <mesh>{white}<sphereGeometry args={[0.55, 32, 32]} /></mesh>
      <mesh position={[0, 0.02, 0.28]} scale={[0.82, 0.62, 0.55]}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color="#d08a2a" metalness={0.95} roughness={0.12} emissive="#3a1d00" />
      </mesh>
      <mesh position={[0, -1.05, 0]}>{white}<capsuleGeometry args={[0.5, 0.7, 8, 16]} /></mesh>
      <mesh position={[0, -0.95, -0.5]}><boxGeometry args={[0.95, 1.05, 0.45]} /><meshStandardMaterial color="#c4c1b9" roughness={0.6} /></mesh>
      <mesh position={[0, -0.82, 0.49]}><boxGeometry args={[0.46, 0.26, 0.08]} /><meshStandardMaterial color={C.accent} emissive={C.accent} emissiveIntensity={0.35} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.72, -0.95, 0.05]} rotation={[0.3, 0, s * 0.55]}>{white}<capsuleGeometry args={[0.17, 0.75, 6, 12]} /></mesh>
          <mesh position={[s * 0.28, -2.05, 0]} rotation={[s * 0.15, 0, s * 0.12]}>{white}<capsuleGeometry args={[0.21, 0.85, 6, 12]} /></mesh>
        </group>
      ))}
    </group>
  )
}

function Vitals({ items }) {
  const g = useRef()
  const [hover, setHover] = useState(null)
  const [pin, setPin] = useState(null)
  const R = 2.65
  useFrame((_, dt) => { if (!hover && !pin) g.current.rotation.y += dt * 0.12 * SPEED })
  const shown = hover ?? pin
  return (
    <group rotation={[-0.25, 0, 0.12]}>
      <group ref={g}>
        {items.map((x, i) => {
          const a = (i / items.length) * Math.PI * 2
          const color = STATUS[x.status] ?? C.tx2
          const on = shown === x.indicator
          return (
            <group key={x.indicator} position={[Math.cos(a) * R, 0, Math.sin(a) * R]}>
              <mesh
                onPointerOver={(e) => { e.stopPropagation(); setHover(x.indicator); document.body.style.cursor = 'pointer' }}
                onPointerOut={() => { setHover(null); document.body.style.cursor = '' }}
                onClick={(e) => { e.stopPropagation(); setPin(pin === x.indicator ? null : x.indicator) }}
              >
                <sphereGeometry args={[on ? 0.11 : 0.075, 16, 16]} />
                <meshBasicMaterial color={color} />
              </mesh>
              <mesh><sphereGeometry args={[0.16, 16, 16]} /><meshBasicMaterial color={color} transparent opacity={on ? 0.28 : 0.12} depthWrite={false} /></mesh>
              {on && (
                <Html center position={[0, 0.32, 0]} zIndexRange={[10, 0]}>
                  <div className="orbit-tip">
                    {x.label}: {x.value} {x.unit}
                    <small>{x.status ? WORD[x.status] : 'No cited threshold'}{x.source === 'simulated' ? ' · simulated' : ''}</small>
                  </div>
                </Html>
              )}
            </group>
          )
        })}
      </group>
    </group>
  )
}

export default function OrbitScene({ items = [] }) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.4, 8.6], fov: 38 }} gl={{ antialias: true, alpha: true }} aria-label="3D orbit: Earth, a station and your latest vitals as satellites">
      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 2.5, 4]} intensity={2.4} color="#fff2e6" />
      <directionalLight position={[-6, -2, -3]} intensity={0.35} color={C.data} />
      <Stars radius={70} depth={40} count={2600} factor={3} saturation={0} fade speed={reduced ? 0 : 0.6} />
      <group position={[1.9, -0.35, 0]}>
        <Earth />
        <Station />
        <Vitals items={items} />
      </group>
      <Astronaut />
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.5} minPolarAngle={Math.PI * 0.3} maxPolarAngle={Math.PI * 0.7} />
    </Canvas>
  )
}
