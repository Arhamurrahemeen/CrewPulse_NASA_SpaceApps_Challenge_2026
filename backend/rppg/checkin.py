"""30 s camera check-in: webcam -> forehead ROI -> POS -> bandpass -> FFT -> heart rate."""

import time
from pathlib import Path

import numpy as np

from rppg.dsp_pipeline import (
    CONFIDENCE_DB_THRESHOLD,
    FS,
    HIGH,
    LOW,
    apply_filter,
    compute_bpm_and_confidence,
    design_bandpass,
    extract_pulse_signal,
)

MODEL_PATH = Path(__file__).parent / "models" / "face_landmarker.task"
SCAN_SECONDS = 30
MIN_FPS = 25.0


def analyze(rgb, fps):
    """(N, 3) RGB means sampled at `fps` -> {bpm, quality_db, fps_measured, accepted}."""
    rgb = np.asarray(rgb, dtype=float)
    # Every DSP call gets the measured rate explicitly, never the FS=30 default:
    # assuming 30 fps when the camera delivers 27 skews bpm by 10 %.
    bpm, quality_db = 0, 0.0
    if fps > 0 and rgb.ndim == 2 and len(rgb) >= 2 * fps:
        pulse = extract_pulse_signal(rgb, method="pos", fs=fps)
        sos = design_bandpass(LOW, HIGH, fs=fps)
        bpm, quality_db = compute_bpm_and_confidence(apply_filter(pulse, sos), fs=fps)
    accepted = bpm > 0 and quality_db >= CONFIDENCE_DB_THRESHOLD and fps >= MIN_FPS
    return {"bpm": bpm, "quality_db": quality_db, "fps_measured": round(fps, 1), "accepted": accepted}


PREVIEW_WINDOW = "CrewPulse check-in"


class ScanCancelled(Exception):
    """User pressed q in the preview window."""


def capture(seconds=SCAN_SECONDS, camera_index=0, preview=True):
    """Record forehead RGB means from the webcam. Returns (rgb, fps of frames with a usable face).

    preview=True opens a local window with the forehead box and a countdown so the user can frame their face.
    """
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision

    from rppg.roi import extract_forehead_roi, get_rgb_signal

    if not MODEL_PATH.exists():
        raise RuntimeError(f"face model missing: {MODEL_PATH} (see README)")

    options = vision.FaceLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
    )
    cam = cv2.VideoCapture(camera_index)
    if not cam.isOpened():
        raise RuntimeError("camera could not be opened")
    cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cam.set(cv2.CAP_PROP_FPS, FS)

    samples = []
    try:
        with vision.FaceLandmarker.create_from_options(options) as landmarker:
            start = time.monotonic()
            while (elapsed := time.monotonic() - start) < seconds:
                ok, frame = cam.read()
                if not ok:
                    continue
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                result = landmarker.detect_for_video(image, int(elapsed * 1000))
                box = None
                if result.face_landmarks:
                    roi, box = extract_forehead_roi(frame, result.face_landmarks[0])
                    rgb = get_rgb_signal(roi)
                    if rgb != (0.0, 0.0, 0.0):
                        samples.append(rgb)
                if preview and _draw_preview(cv2, frame, box, seconds - elapsed) in (ord("q"), ord("Q")):
                    raise ScanCancelled
    finally:
        cam.release()
        if preview:
            cv2.destroyAllWindows()
            cv2.waitKey(1)

    # ponytail: dropped face frames leave gaps that are treated as uniform sampling; they also
    # lower fps_measured, so a scan that lost the face often fails the MIN_FPS gate anyway.
    return np.array(samples), len(samples) / seconds


def _draw_preview(cv2, frame, box, remaining):
    view = frame.copy()
    if box:
        x, y, w, h = box
        cv2.rectangle(view, (x, y), (x + w, y + h), (80, 200, 80), 2)
        msg, color = f"Keep still  {remaining:4.0f} s", (80, 200, 80)
    else:
        msg, color = "No face - face the camera", (60, 60, 240)
    cv2.putText(view, msg, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    cv2.putText(view, "q = cancel", (10, view.shape[0] - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (220, 220, 220), 1)
    cv2.imshow(PREVIEW_WINDOW, view)
    cv2.setWindowProperty(PREVIEW_WINDOW, cv2.WND_PROP_TOPMOST, 1)
    return cv2.waitKey(1) & 0xFF


def scan(seconds=SCAN_SECONDS):
    return analyze(*capture(seconds))
