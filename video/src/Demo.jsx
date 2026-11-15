// 30-second edited demo built from the raw screen recording (public/raw.mp4, 1920x1080).
// Shot list and editing rules: EDIT_SCRIPT.md. Every shot is real footage; the scan result shown
// is a real camera reading taken earlier the same day.
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'

export const FPS = 30
const W = 1920, H = 1080
const XFADE = 0.2 // s
const C = { ink: '#0a0b0d', tx: '#e8e6e1', tx2: '#8a8d93', accent: '#ff4f00' }
const MONO = "'JetBrains Mono', Consolas, monospace"
const SANS = "'Segoe UI', Arial, sans-serif"
const EASE = Easing.bezier(0.45, 0, 0.2, 1)

// focus: { x, y, s, at } = target centre (source px), zoom, start (s into the shot). null = stay wide.
const SHOTS = [
  { name: 'Title', start: 0, end: 3.2, src: 0, rate: 1, focus: null, caption: null },
  { name: 'Begin check-in', start: 3.0, end: 5.6, src: 7.4, rate: 1, focus: { x: 227, y: 830, s: 1.5, at: 0.3 },
    caption: 'Camera check-in: heart rate only, from a 30-second face scan' },
  { name: 'Face scan', start: 5.4, end: 8.6, src: 15.2, rate: 0.55, focus: { x: 420, y: 730, s: 1.35, at: 0.3 },
    caption: 'Face tracking runs in the browser. Video never leaves the device' },
  { name: 'Real result', start: 8.4, end: 11.6, src: 22.0, rate: 1, focus: { x: 275, y: 400, s: 1.7, at: 0.3 },
    caption: 'A real scan from earlier today: 58 bpm. Stress is self-reported' },
  { name: 'Unusual for you', start: 11.4, end: 15.0, src: 41.0, rate: 1.2, focus: { x: 500, y: 420, s: 1.5, at: 0.4 },
    caption: 'Colour only from cited guidelines. “Unusual for you” = vs your own baseline' },
  { name: 'Trends', start: 14.8, end: 17.8, src: 48.5, rate: 1, focus: { x: 500, y: 800, s: 1.6, at: 0.3 },
    caption: '30-day trends, cited range shaded, simulated data labelled' },
  { name: 'Space weather', start: 17.6, end: 19.6, src: 59.0, rate: 1, focus: null,
    caption: 'NASA DONKI space weather, cached for offline use' },
  { name: 'Mission dose', start: 19.4, end: 21.6, src: 64.6, rate: 1, focus: { x: 500, y: 350, s: 1.6, at: 0.2 },
    caption: 'Mission dose is an estimate, never a dosimeter reading' },
  { name: 'Environment', start: 21.4, end: 24.0, src: 68.2, rate: 1, focus: null,
    caption: 'Cabin CO₂, temperature and humidity vs NASA-STD-3001' },
  { name: 'Body map', start: 23.8, end: 27.4, src: 81.6, rate: 1.36, focus: { x: 800, y: 505, s: 1.3, at: 0.2 },
    caption: '3D body map: tap where it hurts to log a symptom' },
  { name: 'End', start: 27.2, end: 30.0, src: 90.2, rate: 1, focus: null, caption: null },
]
export const DURATION = 30 * FPS

// Real clicks in raw-video time (s) and screen pixels, from the recording log.
const CLICKS = [
  [8.85, 227, 830], [14.0, 1284, 560], [42.88, 368, 143], [49.44, 748, 689], [56.33, 1275, 39],
  [68.67, 1460, 39], [76.8, 1640, 39], [82.92, 372, 476], [85.51, 885, 233],
]

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Visible source rectangle for a focus target: centred on it, never past the frame edges.
function viewport(focus, p) {
  if (!focus) return { s: 1, left: 0, top: 0 }
  const sEnd = focus.s
  const left1 = clamp(focus.x - W / (2 * sEnd), 0, W - W / sEnd)
  const top1 = clamp(focus.y - H / (2 * sEnd), 0, H - H / sEnd)
  const vw = interpolate(p, [0, 1], [W, W / sEnd]) // interpolate the rectangle, not the scale, so motion is even
  return { s: W / vw, left: interpolate(p, [0, 1], [0, left1]), top: interpolate(p, [0, 1], [0, top1]) }
}

function Ripple({ x, y }) {
  const f = useCurrentFrame()
  const k = interpolate(f, [0, 18], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }}>
      <div style={{ position: 'absolute', left: -46 * k, top: -46 * k, width: 92 * k, height: 92 * k, borderRadius: '50%', border: `4px solid ${C.accent}`, opacity: 1 - k }} />
      <div style={{ position: 'absolute', left: -8, top: -8, width: 16, height: 16, borderRadius: '50%', background: C.accent, opacity: interpolate(f, [0, 12], [0.85, 0], { extrapolateRight: 'clamp' }) }} />
    </div>
  )
}

function Caption({ text }) {
  const f = useCurrentFrame()
  const o = interpolate(f, [9, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${(1 - o) * 12}px)` }}>
      <div style={{ maxWidth: 1500, background: 'rgba(10,11,13,0.84)', color: C.tx, fontFamily: SANS, fontSize: 40, fontWeight: 600, lineHeight: 1.25, padding: '16px 28px', borderLeft: `6px solid ${C.accent}` }}>
        {text}
      </div>
    </div>
  )
}

function Shot({ shot, first }) {
  const { start, end, src, rate, focus, caption } = shot
  const f = useCurrentFrame()
  const t = f / FPS
  const dur = end - start
  const fadeIn = first ? 1 : interpolate(t, [0, XFADE], [0, 1], { extrapolateRight: 'clamp' })
  const p = focus ? interpolate(t, [focus.at, focus.at + 0.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }) : 0
  const v = viewport(focus, p)
  const srcEnd = src + dur * rate
  return (
    <AbsoluteFill style={{ opacity: fadeIn, backgroundColor: C.ink, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transformOrigin: '0 0', transform: `scale(${v.s}) translate(${-v.left}px, ${-v.top}px)` }}>
        <OffthreadVideo src={staticFile('raw.mp4')} startFrom={Math.round(src * FPS)} playbackRate={rate} muted />
        {CLICKS.filter(([ct]) => ct >= src && ct < srcEnd).map(([ct, x, y]) => (
          <Sequence key={ct} from={Math.round(((ct - src) / rate) * FPS)} durationInFrames={20} layout="none">
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
  const o = interpolate(f, [0, 14], [0, 1], { extrapolateRight: 'clamp', easing: EASE })
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(10,11,13,0.94) 0%, rgba(10,11,13,0.6) 55%, rgba(10,11,13,0) 80%)', justifyContent: 'center', paddingLeft: 110, opacity: o }}>
      <div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 4, color: C.tx2, textTransform: 'uppercase' }}>Team OmniteX · Karachi · NASA Space Apps Challenge 2026</div>
      <div style={{ fontFamily: SANS, fontSize: 150, fontWeight: 800, color: C.tx, letterSpacing: -4, lineHeight: 1, marginTop: 18 }}>CrewPulse</div>
      <div style={{ fontFamily: SANS, fontSize: 46, color: C.tx, marginTop: 18 }}>Astronauts check their own health. No ground link needed.</div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: C.tx2, marginTop: 26 }}>Muhammad Arham · Abdul Awwal</div>
    </AbsoluteFill>
  )
}

function EndCard() {
  const f = useCurrentFrame()
  const o = interpolate(f, [6, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })
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
      {SHOTS.map((s, i) => (
        <Sequence key={s.name} name={s.name} from={Math.round(s.start * FPS)} durationInFrames={Math.round((s.end - s.start) * FPS)}>
          <Shot shot={s} first={i === 0} />
          {s.name === 'Title' && <TitleCard />}
          {s.name === 'End' && <EndCard />}
        </Sequence>
      ))}
      <div style={{ position: 'absolute', right: 24, top: 18, fontFamily: MONO, fontSize: 18, color: 'rgba(232,230,225,0.55)' }}>
        Screen recording · edited with AI assistance (Claude Code)
      </div>
    </AbsoluteFill>
  )
}
