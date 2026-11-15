import numpy as np
import pytest
from fastapi.testclient import TestClient

import db
import main
from rppg.checkin import analyze


def synthetic_rgb(bpm=72, fps=30, seconds=30, pulse=0.5, noise=0.3, seed=0):
    """Forehead RGB means: skin-tone baseline + slow lighting drift + pulse (mostly green) + noise."""
    t = np.arange(int(fps * seconds)) / fps
    rng = np.random.default_rng(seed)
    beat = pulse * np.sin(2 * np.pi * bpm / 60 * t)
    drift = 2.0 * np.sin(2 * np.pi * 0.05 * t)
    base = np.array([150.0, 110.0, 90.0])
    weights = np.array([0.33, 0.77, 0.53])  # relative pulsatile strength per channel (green strongest)
    return base + drift[:, None] + beat[:, None] * weights + rng.normal(0, noise, (len(t), 3))


def test_72_bpm_accepted():
    r = analyze(synthetic_rgb(72), 30.0)
    assert abs(r["bpm"] - 72) <= 2
    assert r["accepted"] and r["quality_db"] >= 3.0


def test_27_fps_uses_measured_rate():
    # If any DSP stage fell back to FS=30, 72 BPM sampled at 27 fps would read ~80 BPM.
    r = analyze(synthetic_rgb(72, fps=27), 27.0)
    assert abs(r["bpm"] - 72) <= 4
    assert r["accepted"] and r["fps_measured"] == 27.0


def test_low_fps_rejected():
    r = analyze(synthetic_rgb(72, fps=20), 20.0)
    assert abs(r["bpm"] - 72) <= 3  # measured fs is used, so the number is still right...
    assert not r["accepted"]  # ...but the scan is rejected


@pytest.mark.xfail(strict=True, reason=(
    "Known issue: the inherited 3 dB CONFIDENCE_DB_THRESHOLD is too weak. Pure noise scores 5.5-9.6 dB "
    "(50/50 seeds pass), a 72 BPM synthetic signal scores 18-20 dB. Retune against oximeter pairs from "
    "tools/validate.py, do not guess a value."))
def test_noise_rejected():
    r = analyze(synthetic_rgb(pulse=0.0, noise=1.0), 30.0)
    assert not r["accepted"]


def test_too_short_is_sentinel():
    assert analyze(np.zeros((10, 3)), 30.0)["bpm"] == 0


def test_checkin_endpoint(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    c = TestClient(main.app)

    monkeypatch.setattr(main.rppg_checkin, "scan", lambda: analyze(synthetic_rgb(72), 30.0))
    r = c.post("/checkin", params={"crew_id": "c1"}).json()
    assert r["accepted"] and abs(r["bpm"] - 72) <= 2

    monkeypatch.setattr(main.rppg_checkin, "scan", lambda: analyze(synthetic_rgb(72, fps=20), 20.0))  # rejected: fps < 25
    r = c.post("/checkin", params={"crew_id": "c1"}).json()
    assert r["bpm"] is None

    def cancelled():
        raise main.rppg_checkin.ScanCancelled

    monkeypatch.setattr(main.rppg_checkin, "scan", cancelled)
    r = c.post("/checkin", params={"crew_id": "c1"}).json()
    assert r["cancelled"] and r["bpm"] is None

    conn = db.connect()
    rows = conn.execute("SELECT indicator, unit, source FROM reading").fetchall()
    conn.close()
    assert [tuple(x) for x in rows] == [("heart_rate", "bpm", "camera")]


def test_oximeter_pair(tmp_path, monkeypatch):
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
    import validate

    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    monkeypatch.setattr(main.rppg_checkin, "scan", lambda: analyze(synthetic_rgb(72), 30.0))
    c = TestClient(main.app)
    scan = c.post("/checkin", params={"crew_id": "c1"}).json()

    pair = lambda bpm, ts=scan["ts"]: c.post("/checkin/oximeter", json={"crew_id": "c1", "camera_ts": ts, "bpm": bpm})
    assert pair(300).status_code == 422
    assert pair(73, ts="2000-01-01T00:00:00+00:00").status_code == 404
    assert pair(73).status_code == 200
    assert pair(74).status_code == 409  # one oximeter value per scan

    cam, oxi = validate.load(tmp_path / "t.db", "c1")
    assert validate.pair(cam, oxi, window_s=0) == [(scan["bpm"], 73.0, scan["quality_db"])]  # exact, dt = 0


# ---------- in-browser check-in: RGB trace + timestamps ----------
def browser_trace(bpm=72, fps=29.0, seconds=30, jitter_ms=6, seed=1, drop=None):
    """Frames at an uneven browser rate; the pulse is sampled at the real (jittered) times."""
    rng = np.random.default_rng(seed)
    t = np.cumsum(np.full(int(fps * seconds), 1000 / fps) + rng.normal(0, jitter_ms, int(fps * seconds)))
    t -= t[0]
    s = t / 1000
    beat = 0.5 * np.sin(2 * np.pi * bpm / 60 * s)
    rgb = np.array([150.0, 110.0, 90.0]) + 2 * np.sin(2 * np.pi * 0.05 * s)[:, None] + beat[:, None] * np.array([0.33, 0.77, 0.53])
    rgb += rng.normal(0, 0.3, rgb.shape)
    if drop:  # remove frames in [a, b) ms, as if the face was lost
        keep = (t < drop[0]) | (t >= drop[1])
        t, rgb = t[keep], rgb[keep]
    return rgb.tolist(), t.tolist()


def test_trace_jittered_29fps():
    from rppg.checkin import analyze_trace
    r = analyze_trace(*browser_trace(72, fps=29.0))
    assert abs(r["bpm"] - 72) <= 3 and r["accepted"] and 28 <= r["fps_measured"] <= 30


def test_trace_face_lost_rejected():
    from rppg.checkin import analyze_trace
    r = analyze_trace(*browser_trace(72, drop=(10000, 11500)))
    assert not r["accepted"] and r["max_gap_s"] > 1


def test_trace_route_stores_and_validates(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    c = TestClient(main.app)
    rgb, t = browser_trace(66, fps=30.0)
    r = c.post("/checkin/trace", json={"crew_id": "c9", "rgb": rgb, "t_ms": t}).json()
    assert r["accepted"] and abs(r["bpm"] - 66) <= 3 and r["ts"]
    stored = c.get("/readings", params={"crew_id": "c9"}).json()
    assert stored[0]["source"] == "camera" and stored[0]["quality"] == r["quality_db"]
    lost = c.post("/checkin/trace", json={"crew_id": "c9", "rgb": browser_trace(drop=(5000, 7000))[0], "t_ms": browser_trace(drop=(5000, 7000))[1]}).json()
    assert lost["bpm"] is None and "face was lost" in lost["message"]
    assert c.post("/checkin/trace", json={"crew_id": "c9", "rgb": [[1, 2]] * 5, "t_ms": [0, 1, 2, 3, 4]}).status_code == 422
    assert c.post("/checkin/trace", json={"crew_id": "c9", "rgb": [[1, 2, 3]] * 5, "t_ms": [0, 1, 2]}).status_code == 422
