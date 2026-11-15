// Web Worker for the in-browser check-in: face landmarks only (~60-90 ms each, too slow for the page thread).
// The page sends at most one small frame at a time; nothing queues here, so camera buffers are never held.
// (Queued frames starved the camera and caused multi-second stalls in testing.)
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

const FOREHEAD_IDS = [10, 109, 67, 103, 338, 297, 332, 284] // same landmarks as backend/rppg/roi.py
const CHEEK_R = 234, CHEEK_L = 454

let lm = null, lastTs = 0

// MediaPipe loads its WASM loader with importScripts, which module workers (what Vite builds) don't have.
// Evaluate the bundled loader once in global scope ourselves, then pass no loader path so it is not loaded again.
async function loadFactory() {
  if (self.ModuleFactory) return
  const code = await (await fetch(wasmLoaderPath)).text()
  ;(0, eval)(code) // global-scope eval defines ModuleFactory on self
  if (!self.ModuleFactory) throw new Error('MediaPipe WASM loader did not define ModuleFactory')
}

const make = async (modelUrl, delegate) => (await loadFactory(), FaceLandmarker.createFromOptions(
  { wasmLoaderPath: '', wasmBinaryPath },
  { baseOptions: { modelAssetPath: modelUrl, delegate }, runningMode: 'VIDEO', numFaces: 1 },
))

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      lm ??= await make(data.modelUrl, 'GPU').catch(() => make(data.modelUrl, 'CPU'))
      self.postMessage({ type: 'ready' })
    } catch (e) {
      self.postMessage({ type: 'error', message: `Face model could not load from the local backend (${e.message ?? e}).` })
    }
    return
  }
  if (data.type !== 'detect') return
  const { bitmap, t } = data
  let face = null
  try {
    if (lm) {
      lastTs = Math.max(t, lastTs + 1)
      const L = lm.detectForVideo(bitmap, lastTs).faceLandmarks?.[0]
      if (L) {
        const xs = FOREHEAD_IDS.map((i) => L[i].x), ys = FOREHEAD_IDS.map((i) => L[i].y)
        let fx0 = 1, fy0 = 1, fx1 = 0, fy1 = 0
        const mesh = []
        for (let i = 0; i < L.length; i++) {
          const { x, y } = L[i]
          if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (y < fy0) fy0 = y; if (y > fy1) fy1 = y
          if (i % 3 === 0) mesh.push(x, y)
        }
        face = {
          box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], // normalised x0, y0, x1, y1
          faceBox: [fx0, fy0, fx1, fy1], mesh, faceFrac: Math.abs(L[CHEEK_L].x - L[CHEEK_R].x),
        }
      }
    }
  } finally {
    bitmap.close()
    self.postMessage({ type: 'face', t, face })
  }
}
