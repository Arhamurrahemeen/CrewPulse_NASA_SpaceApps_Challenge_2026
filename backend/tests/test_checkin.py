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
