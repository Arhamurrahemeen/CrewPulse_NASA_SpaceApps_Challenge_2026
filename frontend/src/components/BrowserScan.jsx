// In-browser camera check-in. The camera, face landmarks and forehead averaging run in this page; only three
// numbers per frame (mean R, G, B of the forehead) plus a timestamp go to the local backend, which runs the same
// POS -> bandpass -> FFT -> quality gate as before (backend/rppg/checkin.py analyze_trace). No video leaves the page.
import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import { API, api } from '../api.js'

const FOREHEAD_IDS = [10, 109, 67, 103, 338, 297, 332, 284] // same landmarks as backend/rppg/roi.py
const CHEEK_R = 234, CHEEK_L = 454 // face edges, for the distance estimate
export const SCAN_SECONDS = 30
const NO_FACE_TIMEOUT_MS = 20000
const COLOR = { green: '#3fb68b', amber: '#e8b23a', red: '#e5484d', data: '#5fb3f9' }

// Distance from face width as a share of the frame width. A typical webcam (~60-70° wide) sees a face at
// ~0.2-0.3 of the frame at 40-60 cm. ASSUMPTION: approximate, camera-dependent; it only guides framing.
export function distanceOf(faceFrac) {
  if (faceFrac >= 0.18 && faceFrac <= 0.4) return { status: 'green', text: 'Distance good' }
  if (faceFrac > 0.55) return { status: 'red', text: 'Far too close: move back' }
  if (faceFrac > 0.4) return { status: 'amber', text: 'A little close: move back' }
  if (faceFrac >= 0.12) return { status: 'amber', text: 'A little far: move closer' }
  return { status: 'red', text: 'Too far: move closer' }
}
// Forehead brightness (0-255 green mean). Guidance only; the backend's quality gate decides.
export function lightOf(g) {
  if (g < 50) return { status: 'red', text: 'Too dark: add light from the front' }
  if (g < 80) return { status: 'amber', text: 'Dim: more light helps' }
  if (g > 235) return { status: 'amber', text: 'Too bright: avoid direct glare' }
  return { status: 'green', text: 'Light good' }
}

let landmarker
function getLandmarker() {
  landmarker ??= FaceLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    { baseOptions: { modelAssetPath: `${API}/rppg/model` }, runningMode: 'VIDEO', numFaces: 1 },
  ).catch((e) => {
    landmarker = null
    throw new Error(`Face model could not load from the local backend (${e.message ?? e}).`)
  })
  return landmarker
}
// Called when the Check-in page opens: downloads and compiles the face tracker before the user clicks Start,
// so the click only waits for the camera hardware. Never turns the camera on.
export function warmUp() {
  getLandmarker().catch(() => {})
}

function onFrames(video, cb) {
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    let id
    const loop = (now, meta) => { cb(now, meta.mediaTime * 1000); id = video.requestVideoFrameCallback(loop) }
    id = video.requestVideoFrameCallback(loop)
    return () => video.cancelVideoFrameCallback(id)
  }
  let raf, last = -1
  const loop = (now) => {
    if (video.currentTime !== last) { last = video.currentTime; cb(now, now) }
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}

function drawBrackets(ctx, x, y, w, h, color, len = 22) {
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(cx, cy + len * sy); ctx.lineTo(cx, cy); ctx.lineTo(cx + len * sx, cy)
  }
  ctx.stroke()
}

export default function BrowserScan({ crew, onDone }) {
  const videoRef = useRef()
  const overlayRef = useRef()
  const [left, setLeft] = useState(SCAN_SECONDS)
  const [hint, setHint] = useState('Starting camera…')
  const [face, setFace] = useState(false)
  const [dist, setDist] = useState(null)
  const [light, setLight] = useState(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    let stream, stopFrames, done = false
    const rgb = [], tms = [], green = []
    const roi = document.createElement('canvas')
    const rctx = roi.getContext('2d', { willReadFrequently: true })
    const finish = (result) => {
      if (done) return
      done = true
      stopFrames?.()
      stream?.getTracks().forEach((t) => t.stop())
      onDone(result)
    }

    ;(async () => {
      try {
        // Camera and face tracker start in parallel; the tracker is usually ready already (warmUp).
        const modelReady = getLandmarker()
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 } }, audio: false })
        if (done) { s.getTracks().forEach((t) => t.stop()); return } // unmounted while asking for the camera
        stream = s
        const v = videoRef.current
        v.srcObject = stream
        await v.play()
        setLive(true)
        setHint('Loading face tracker…')
        const lm = await modelReady
        if (done) return
        setHint('Finding your face…')
        const t0 = performance.now()
        let start = null, lastDetect = 0
        stopFrames = onFrames(v, async (now, mediaMs) => {
          if (done) return
          const W = v.videoWidth, H = v.videoHeight
          const cv = overlayRef.current
          if (!cv || !W) return
          if (cv.width !== W) { cv.width = W; cv.height = H }
          const ctx = cv.getContext('2d')
          ctx.clearRect(0, 0, W, H)
          const ts = Math.max(now, lastDetect + 1)
          lastDetect = ts
          const L = lm.detectForVideo(v, ts).faceLandmarks?.[0]
          if (L) {
            // --- scan effect: mesh dots, face brackets, sweeping beam ---
            let fx0 = W, fy0 = H, fx1 = 0, fy1 = 0
            ctx.fillStyle = 'rgba(95,179,249,0.55)'
            for (let i = 0; i < L.length; i++) {
              const px = L[i].x * W, py = L[i].y * H
              if (px < fx0) fx0 = px; if (px > fx1) fx1 = px; if (py < fy0) fy0 = py; if (py > fy1) fy1 = py
              if (i % 3 === 0) ctx.fillRect(px - 1, py - 1, 2, 2)
            }
            const fw = fx1 - fx0, fh = fy1 - fy0
            drawBrackets(ctx, fx0 - 14, fy0 - 18, fw + 28, fh + 30, 'rgba(232,230,225,0.9)')
            const sweep = fy0 - 18 + ((Math.sin(now / 650) + 1) / 2) * (fh + 30)
            const grad = ctx.createLinearGradient(0, sweep - 26, 0, sweep + 2)
            grad.addColorStop(0, 'rgba(95,179,249,0)')
            grad.addColorStop(1, 'rgba(95,179,249,0.45)')
            ctx.fillStyle = grad
            ctx.fillRect(fx0 - 14, sweep - 26, fw + 28, 28)
            ctx.fillStyle = 'rgba(95,179,249,0.9)'
            ctx.fillRect(fx0 - 14, sweep, fw + 28, 1.5)

            // --- distance from face width, colours the forehead box ---
            const d = distanceOf(Math.abs(L[CHEEK_L].x - L[CHEEK_R].x))
            setDist(d)

            // --- forehead ROI: the only pixels that become data ---
            const xs = FOREHEAD_IDS.map((i) => L[i].x * W), ys = FOREHEAD_IDS.map((i) => L[i].y * H)
            const x = Math.max(0, Math.floor(Math.min(...xs))), y = Math.max(0, Math.floor(Math.min(...ys)))
            const w = Math.min(W, Math.ceil(Math.max(...xs))) - x, h = Math.min(H, Math.ceil(Math.max(...ys))) - y
            if (w > 2 && h > 2) {
              roi.width = w; roi.height = h
              rctx.drawImage(v, x, y, w, h, 0, 0, w, h)
              const px = rctx.getImageData(0, 0, w, h).data
              let r = 0, g = 0, b = 0
              for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2] }
              const n = px.length / 4
              start ??= mediaMs
              rgb.push([r / n, g / n, b / n])
              tms.push(mediaMs)
              green.push(g / n)
              const lt = lightOf(g / n)
              setLight(lt)
              ctx.fillStyle = `${COLOR[d.status]}22`
              ctx.fillRect(x, y, w, h)
              ctx.strokeStyle = COLOR[d.status]; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h)
              setFace(true)
              setHint(d.status !== 'green' ? d.text + '.' : lt.status !== 'green' ? lt.text + '.' : 'Hold still. Breathe normally.')
            }
          } else {
            setFace(false)
            setDist(null)
            setHint('No face found. Centre your face in the frame.')
          }
          // live green trace (detrended over the visible window)
          const tail = green.slice(-150)
          if (tail.length > 10) {
            const mean = tail.reduce((a, c) => a + c, 0) / tail.length
            const amp = Math.max(0.5, ...tail.map((c) => Math.abs(c - mean)))
            ctx.strokeStyle = COLOR.data; ctx.lineWidth = 2; ctx.beginPath()
            tail.forEach((c, i) => {
              const px = (i / 149) * W, py = H - 46 - ((c - mean) / amp) * 22
              i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
            })
            ctx.stroke()
          }
          if (start === null) {
            if (now - t0 > NO_FACE_TIMEOUT_MS) finish({ error: 'No face found for 20 s. Face the camera in even light and try again.' })
            return
          }
          const elapsed = (mediaMs - start) / 1000
          setLeft(Math.max(0, Math.ceil(SCAN_SECONDS - elapsed)))
          if (elapsed >= SCAN_SECONDS) {
            stopFrames()
            setHint('Analysing…')
            try {
              finish(await api('/checkin/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crew_id: crew, rgb, t_ms: tms }) }))
            } catch (e) {
              finish({ error: e.message })
            }
          }
        })
      } catch (e) {
        finish({ error: e?.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this page and try again.' : e?.name === 'NotFoundError' ? 'No camera found on this device.' : (e?.message ?? String(e)) })
      }
    })()
    return () => finish(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const p = 1 - left / SCAN_SECONDS
  return (
    <div className={`scanner live${live ? ' on' : ''}`}>
      <video ref={videoRef} muted playsInline />
      <canvas ref={overlayRef} />
      {!live && <div className="scan-boot mono">Starting camera…</div>}
      <div className="scan-hud">
        <div className="scan-chips">
          <span className={`mark ${face ? 'green' : 'red'}`}>{face ? 'Face found' : 'No face'}</span>
          {dist && <span className={`mark ${dist.status}`}>{dist.text}</span>}
          {light && face && <span className={`mark ${light.status}`}>{light.text}</span>}
        </div>
        <svg viewBox="0 0 40 40" className="scan-ring" aria-label={`${left} seconds left`}>
          <circle cx="20" cy="20" r="16" className="ring-bg" />
          <circle cx="20" cy="20" r="16" className="ring" style={{ strokeDasharray: 100.5, strokeDashoffset: 100.5 * (1 - p) }} transform="rotate(-90 20 20)" />
          <text x="20" y="24" className="ring-t">{left}</text>
        </svg>
      </div>
      <p className="scan-hint mono" aria-live="polite">{hint}</p>
    </div>
  )
}
