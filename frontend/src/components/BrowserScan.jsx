// In-browser camera check-in. Face landmarks and forehead averaging run in a Web Worker (faceWorker.js); this page
// only grabs frames, collects the forehead RGB means with their camera timestamps, and draws the scan overlay.
// Only those numbers go to the local backend, which runs the same POS -> bandpass -> FFT -> quality gate
// (backend/rppg/checkin.py analyze_trace). No video leaves the page.
import { useEffect, useRef, useState } from 'react'
import { API, api } from '../api.js'

export const SCAN_SECONDS = 30
const NO_FACE_TIMEOUT_MS = 20000
const DETECT_EVERY = 5 // ask for landmarks every 5th frame (~6 Hz) when the worker is free; every frame is sampled
// Keep sampling with the last forehead box until the tracker reports NO face (or nothing for 2 s). Tying samples to
// tracker speed made a busy GPU look like a lost face (6 fps traces while screen-recording).
const FACE_STALE_MS = 2000
const GRAB = { resizeWidth: 320, resizeHeight: 240 } // plenty for a forehead mean, cheaper to move and track
const UI_EVERY_MS = 250
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

// One worker for the page's lifetime; created and initialised as soon as the Check-in page opens.
let worker, ready
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./faceWorker.js', import.meta.url), { type: 'module' })
    ready = new Promise((resolve, reject) => {
      const onMsg = ({ data }) => {
        if (data.type === 'ready') { worker.removeEventListener('message', onMsg); resolve(worker) }
        if (data.type === 'error') { worker.removeEventListener('message', onMsg); worker.terminate(); worker = null; reject(new Error(data.message)) }
      }
      worker.addEventListener('message', onMsg)
    })
    worker.postMessage({ type: 'init', modelUrl: `${API}/rppg/model` })
  }
  return ready
}
// Called when the Check-in page opens: loads the face tracker before the user clicks Start. Never turns the camera on.
export function warmUp() {
  getWorker().catch(() => {})
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
  const [fps, setFps] = useState(null)

  // Scan mode: switch off decorative GPU work (glass blur, starfield, filters) while the camera runs; on a small
  // laptop GPU these took frames from the camera and the face tracker.
  useEffect(() => {
    document.documentElement.classList.add('scan-mode')
    return () => document.documentElement.classList.remove('scan-mode')
  }, [])

  useEffect(() => {
    let stream, stopFrames, stopDraw, w, done = false, sending = false
    const rgb = [], tms = [], green = []
    let latest = null, faceOk = false, d = null, lt = null, start = null, frame = 0, faceSeenAt = -1e9, inflight = false, lastHit = false
    const diag = { frames: 0, detects: 0, detectHits: 0, busySkips: 0 }
    const roi = document.createElement('canvas')
    // GPU-backed canvas: drawing the video is a GPU copy; only the small downscaled patch is read back.
    // (willReadFrequently forced a CPU copy of every full frame, ~10 ms each on this laptop.)
    const rctx = roi.getContext('2d', { alpha: false })
    rctx.imageSmoothingEnabled = true
    rctx.imageSmoothingQuality = 'high'
    const finish = (result) => {
      if (done) return
      done = true
      stopFrames?.(); stopDraw?.()
      w?.removeEventListener('message', onMsg)
      stream?.getTracks().forEach((t) => t.stop())
      onDone(result)
    }

    async function send() {
      if (sending) return
      sending = true
      stopFrames?.()
      setHint('Analysing…')
      let maxGap = 0
      for (let i = 1; i < tms.length; i++) maxGap = Math.max(maxGap, tms[i] - tms[i - 1])
      console.info('[CrewPulse scan]', JSON.stringify({ ...diag, samples: tms.length, spanS: +((tms.at(-1) - tms[0]) / 1000).toFixed(1), maxGapMs: Math.round(maxGap) }))
      try {
        finish(await api('/checkin/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crew_id: crew, rgb, t_ms: tms }) }))
      } catch (e) {
        finish({ error: e.message })
      }
    }

    function onMsg({ data }) {
      if (data.type !== 'face' || done) return
      inflight = false
      diag.detects++
      lastHit = !!data.face
      if (data.face) {
        diag.detectHits++
        latest = data.face
        faceSeenAt = data.t
        d = distanceOf(data.face.faceFrac)
      }
    }

    ;(async () => {
      try {
        const workerReady = getWorker() // usually ready already (warmUp)
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 } }, audio: false })
        if (done) { s.getTracks().forEach((t) => t.stop()); return } // unmounted while asking for the camera
        stream = s
        const v = videoRef.current
        v.srcObject = stream
        await v.play()
        setLive(true)
        setHint('Loading face tracker…')
        w = await workerReady
        if (done) return
        w.addEventListener('message', onMsg)
        setHint('Finding your face…')
        const t0 = performance.now()

        // Every frame: average the forehead box here (~10 ms) and release the frame at once.
        // Every 5th frame, if the worker is free: send one small bitmap for face tracking (never queued).
        stopFrames = onFrames(v, (now, mediaMs) => {
          if (done || sending) return
          diag.frames++
          const W = v.videoWidth, H = v.videoHeight
          if (frame++ % DETECT_EVERY === 0) {
            if (inflight) diag.busySkips++
            else {
              inflight = true
              createImageBitmap(v, GRAB).then((bitmap) => {
                if (done) { bitmap.close(); return }
                w.postMessage({ type: 'detect', bitmap, t: mediaMs }, [bitmap])
              }).catch(() => { inflight = false })
            }
          }
          faceOk = !!latest && lastHit && mediaMs - faceSeenAt < FACE_STALE_MS
          if (!faceOk || !W) return
          const [x0, y0, x1, y1] = latest.box
          const x = Math.max(0, Math.floor(x0 * W)), y = Math.max(0, Math.floor(y0 * H))
          const bw = Math.min(W, Math.ceil(x1 * W)) - x, bh = Math.min(H, Math.ceil(y1 * H)) - y
          if (bw < 2 || bh < 2) return
          const sw = Math.max(2, Math.round(bw / 2)), sh = Math.max(2, Math.round(bh / 2)) // 2x downscale, averaged
          if (roi.width !== sw || roi.height !== sh) {
            roi.width = sw; roi.height = sh
            rctx.imageSmoothingEnabled = true; rctx.imageSmoothingQuality = 'high'
          }
          rctx.drawImage(v, x, y, bw, bh, 0, 0, sw, sh)
          const px = rctx.getImageData(0, 0, sw, sh).data
          let r = 0, g = 0, b = 0
          for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2] }
          const n = px.length / 4
          start ??= mediaMs
          rgb.push([r / n, g / n, b / n])
          tms.push(mediaMs)
          green.push(g / n)
          lt = lightOf(g / n)
          if (mediaMs - start >= SCAN_SECONDS * 1000) send()
        })

        // overlay + UI on animation frames
        let raf, lastUi = 0
        let lastDrawn = -1
        const draw = (now) => {
          raf = requestAnimationFrame(draw)
          if (diag.frames === lastDrawn) return // no new camera frame: nothing to redraw
          lastDrawn = diag.frames
          const cv = overlayRef.current
          const W = v.videoWidth, H = v.videoHeight
          if (!cv || !W) return
          if (cv.width !== W) { cv.width = W; cv.height = H }
          const ctx = cv.getContext('2d')
          ctx.clearRect(0, 0, W, H)
          if (faceOk && latest) {
            const [a, b, c, e] = latest.faceBox
            const fx0 = a * W, fy0 = b * H, fw = (c - a) * W, fh = (e - b) * H
            ctx.fillStyle = 'rgba(95,179,249,0.55)'
            const m = latest.mesh
            for (let i = 0; i < m.length; i += 2) ctx.fillRect(m[i] * W - 1, m[i + 1] * H - 1, 2, 2)
            drawBrackets(ctx, fx0 - 14, fy0 - 18, fw + 28, fh + 30, 'rgba(232,230,225,0.9)')
            const sweep = fy0 - 18 + ((Math.sin(now / 650) + 1) / 2) * (fh + 30)
            const grad = ctx.createLinearGradient(0, sweep - 26, 0, sweep + 2)
            grad.addColorStop(0, 'rgba(95,179,249,0)')
            grad.addColorStop(1, 'rgba(95,179,249,0.45)')
            ctx.fillStyle = grad
            ctx.fillRect(fx0 - 14, sweep - 26, fw + 28, 28)
            ctx.fillStyle = 'rgba(95,179,249,0.9)'
            ctx.fillRect(fx0 - 14, sweep, fw + 28, 1.5)
            const [x0, y0, x1, y1] = latest.box
            ctx.fillStyle = `${COLOR[d.status]}22`
            ctx.fillRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H)
            ctx.strokeStyle = COLOR[d.status]; ctx.lineWidth = 3
            ctx.strokeRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H)
          }
          const tail = green.slice(-150)
          if (tail.length > 10) {
            const mean = tail.reduce((p, q) => p + q, 0) / tail.length
            const amp = Math.max(0.5, ...tail.map((q) => Math.abs(q - mean)))
            ctx.strokeStyle = COLOR.data; ctx.lineWidth = 2; ctx.beginPath()
            tail.forEach((q, i) => {
              const px = (i / 149) * W, py = H - 46 - ((q - mean) / amp) * 22
              i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
            })
            ctx.stroke()
          }
          if (now - lastUi >= UI_EVERY_MS) {
            lastUi = now
            const last = tms.at(-1)
            let k = tms.length - 1
            while (k >= 0 && last - tms[k] < 1000) k--
            setFps(tms.length > 1 ? tms.length - 1 - k : null)
            setFace(faceOk)
            setDist(faceOk ? d : null)
            setLight(faceOk ? lt : null)
            if (!sending) {
              setHint(!faceOk ? 'No face found. Centre your face in the frame.'
                : d && d.status !== 'green' ? d.text + '.' : lt && lt.status !== 'green' ? lt.text + '.' : 'Hold still. Breathe normally.')
            }
            if (start !== null) setLeft(Math.max(0, Math.ceil(SCAN_SECONDS - (last - start) / 1000)))
            else if (now - t0 > NO_FACE_TIMEOUT_MS) finish({ error: 'No face found for 20 s. Face the camera in even light and try again.' })
          }
        }
        raf = requestAnimationFrame(draw)
        stopDraw = () => cancelAnimationFrame(raf)
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
          {fps != null && face && <span className={`mark ${fps >= 25 ? 'green' : 'amber'}`} title="The scan needs at least 25 frames per second">{fps} fps</span>}
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
