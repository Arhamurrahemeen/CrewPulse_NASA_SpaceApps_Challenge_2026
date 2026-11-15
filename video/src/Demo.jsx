// 30-second edited demo built from the raw screen recording (public/raw.mp4, 1920x1080).
// Every shot is real footage; the scan result shown is a real camera reading taken earlier the same day.
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'

export const FPS = 30
const C = { ink: '#0a0b0d', tx: '#e8e6e1', tx2: '#8a8d93', accent: '#ff4f00', data: '#5fb3f9' }
const MONO = "'JetBrains Mono', Consolas, monospace"
const SANS = "'Segoe UI', Arial, sans-serif"

// [name, editStart s, editDur s, srcStart s, rate, zoom, originX, originY, caption]
const SHOTS = [
  ['Who we are', 0, 3, 0, 1, 1.0, 960, 540, null],
  ['Challenge', 3, 2, 4.4, 1, 1.15, 1300, 520, 'The challenge: crews far from Earth must check their own health, often offline'],
  ['Camera check-in', 5, 5.9, 13.9, 0.7, 1.4, 700, 520, 'Camera check-in: heart rate only. Face tracking runs in the browser; video never leaves the device'],
  ['Real result', 10.9, 2.5, 18.6, 2, 1.7, 380, 330, 'A real scan from earlier today: 58 bpm. Stress is self-reported, never guessed by the camera'],
  ['Unusual for you', 13.4, 3, 41.0, 2, 1.45, 420, 330, 'Colours only from cited guidelines · "Unusual for you" vs your own 28-day baseline'],
  ['Vitals field', 16.4, 2.5, 47.6, 2, 1.15, 960, 640, 'Vitals field (3D): 30 days of readings as σ from your own baseline'],
  ['NASA DONKI', 18.9, 3, 58.0, 2, 1.1, 960, 560, 'NASA DONKI space weather, cached for offline use · dose labelled as an estimate'],
  ['NASA-STD-3001', 21.9, 2, 70.4, 2, 1.25, 900, 500, 'Cabin CO₂, temperature and humidity vs NASA-STD-3001'],
  ['Body map', 23.9, 3.5, 79.0, 2.6, 1.4, 600, 520, '3D body map: tap where it hurts to log a symptom'],
  ['Vision', 27.4, 2.6, 90.0, 1, 1.0, 960, 540, null],
]
export const DURATION = 30 * FPS

// Clicks in raw-video time (s) and screen pixels, from the recording log.
const CLICKS = [
  [10.62, 227, 830], [14.0, 1284, 560], [42.88, 368, 143], [49.44, 748, 689], [56.33, 1275, 39],
  [68.67, 1460, 39], [76.8, 1640, 39], [82.92, 372, 476], [85.51, 885, 233],
]

function Ripple({ x, y }) {
  const f = useCurrentFrame()
  const k = interpolate(f, [0, 16], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }}>
      <div style={{ position: 'absolute', left: -60 * k, top: -60 * k, width: 120 * k, height: 120 * k, borderRadius: '50%', border: `5px solid ${C.accent}`, opacity: 1 - k }} />
      <div style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: '50%', background: C.accent, opacity: interpolate(f, [0, 10], [0.9, 0], { extrapolateRight: 'clamp' }) }} />
    </div>
  )
}

function Caption({ text }) {
  const f = useCurrentFrame()
  const o = interpolate(f, [0, 8], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>
      <div style={{ maxWidth: 1500, background: 'rgba(10,11,13,0.82)', color: C.tx, fontFamily: SANS, fontSize: 40, fontWeight: 600, lineHeight: 1.25, padding: '16px 28px', borderLeft: `6px solid ${C.accent}`, textAlign: 'left' }}>
        {text}
      </div>
    </div>
  )
}

function Shot({ shot }) {
  const [, , dur, src, rate, zoom, ox, oy, caption] = shot
  const f = useCurrentFrame()
  const z = interpolate(f, [0, 18], [1, zoom], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  const srcEnd = src + dur * rate
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: `${ox}px ${oy}px` }}>
        <OffthreadVideo src={staticFile('raw.mp4')} startFrom={Math.round(src * FPS)} playbackRate={rate} muted />
        {CLICKS.filter(([t]) => t >= src && t < srcEnd).map(([t, x, y]) => (
          <Sequence key={t} from={Math.round(((t - src) / rate) * FPS)} durationInFrames={18} layout="none">
            <Ripple x={x} y={y} />
          </Sequence>
        ))}
      </AbsoluteFill>
      {caption && <Caption text={caption} />}
    </AbsoluteFill>
  )
}

function TitleCard() {
  const f = useCurrentFrame()
  const o = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(10,11,13,0.92) 0%, rgba(10,11,13,0.55) 55%, rgba(10,11,13,0) 80%)', justifyContent: 'center', paddingLeft: 110, opacity: o }}>
      <div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 4, color: C.tx2, textTransform: 'uppercase' }}>Team OmniteX · Karachi · NASA Space Apps Challenge 2026</div>
      <div style={{ fontFamily: SANS, fontSize: 150, fontWeight: 800, color: C.tx, letterSpacing: -4, lineHeight: 1, marginTop: 18 }}>CrewPulse</div>
      <div style={{ fontFamily: SANS, fontSize: 46, color: C.tx, marginTop: 18 }}>Astronauts check their own health. No ground link needed.</div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: C.tx2, marginTop: 26 }}>Muhammad Arham · Abdul Awwal</div>
    </AbsoluteFill>
  )
}

function EndCard() {
  const f = useCurrentFrame()
  const o = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: 'rgba(10,11,13,0.86)', justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: o }}>
      <div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 4, color: C.accent, textTransform: 'uppercase' }}>Next</div>
      <div style={{ fontFamily: SANS, fontSize: 60, fontWeight: 700, color: C.tx, marginTop: 14, maxWidth: 1500 }}>
        Validate the camera against oximeters, then fly it with lunar and Mars crews
      </div>
      <div style={{ fontFamily: SANS, fontSize: 40, color: C.tx, marginTop: 40 }}>CrewPulse · Team OmniteX</div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: C.tx2, marginTop: 14 }}>Decision support, not a medical device · works fully offline</div>
    </AbsoluteFill>
  )
}

export function CrewPulseDemo() {
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      {SHOTS.map((s) => (
        <Sequence key={s[0]} name={s[0]} from={Math.round(s[1] * FPS)} durationInFrames={Math.round(s[2] * FPS)}>
          <Shot shot={s} />
          {s[0] === 'Who we are' && <TitleCard />}
          {s[0] === 'Vision' && <EndCard />}
        </Sequence>
      ))}
      <div style={{ position: 'absolute', right: 24, top: 18, fontFamily: MONO, fontSize: 18, color: 'rgba(232,230,225,0.55)' }}>
        Screen recording · edited with AI assistance (Claude Code)
      </div>
    </AbsoluteFill>
  )
}
