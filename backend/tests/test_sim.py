from datetime import datetime, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

import db
import main
from sim import generate as sim

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    conn = db.connect()
    with conn:  # a real reading that must survive regeneration
        conn.execute("INSERT INTO reading (crew_id, ts, indicator, value, unit, source) VALUES "
                     "('crew-1', '2026-11-01T08:00:00+00:00', 'heart_rate', 66, 'bpm', 'manual')")
    conn.close()
    sim.write(sim.generate(4, 90, 42))
    sim.write(sim.generate(4, 90, 42))  # re-run replaces, never duplicates
    return TestClient(main.app)


def test_reproducible():
    a, b = sim.generate(4, 90, 42, now=NOW), sim.generate(4, 90, 42, now=NOW)
    assert a == b and a != sim.generate(4, 90, 7, now=NOW)


def test_planted_anomaly_fires_for_each_crew(client):
    for i, crew in enumerate(["crew-1", "crew-2", "crew-3", "crew-4"]):
        planted, _ = sim.PLANTED[i]
        status = {x["indicator"]: x for x in client.get(f"/status/{crew}").json()}
        b = status[planted]["baseline"]
        assert b["unusual"], f"{crew} {planted} {b}"
        assert np.sign(b["z"]) == np.sign(b["z_prev"]) and abs(b["z"]) >= 2
        side = "Above" if b["z"] > 0 else "Below"
        assert b["reasons"] and b["reasons"][0].startswith(f"{side} your usual range two days in a row")
        assert status[planted]["unit"] in b["reasons"][0]


def test_bp_pair_shares_timestamp(client):
    status = {x["indicator"]: x for x in client.get("/status/crew-3").json()}
    assert status["bp_systolic"]["ts"] == status["bp_diastolic"]["ts"]


def test_all_simulated_and_real_rows_kept(client):
    rows = client.get("/readings", params={"crew_id": "crew-1", "limit": 5000}).json()
    sources = [r["source"] for r in rows]
    assert sources.count("manual") == 1 and set(sources) == {"simulated", "manual"}
    per_day = len([r for r in rows if r["indicator"] == "heart_rate" and r["source"] == "simulated"])
    assert per_day == 90  # not duplicated by the second write


def test_cited_effects_present():
    rows = [r for crew in sim.generate(4, 90, 42, now=NOW).values() for r in crew]
    sleep = np.array([r[3] for r in rows if r[2] == "sleep_hours"])
    assert abs(np.median(sleep) - 6.5) < 0.3  # Jones et al. ~6.5 h in flight
    assert (sleep < 5).sum() >= 4 * 3  # short-sleep episodes (plus crew-2's planted nights)
    bone = [r[3] for r in rows if r[0] == "crew-1" and r[2] == "bone_tibia_bmd_pct"]
    assert bone[-1] < bone[0] and -2.5 < bone[-1] < -1.0  # ~-1.7 % after 90 of 180 days (Gabel -3.4 % at return)


def test_values_within_limits_and_units():
    from rules.engine import INDICATORS
    for crew in sim.generate(4, 90, 42, now=NOW).values():
        for _, _, ind, v, unit, src in crew:
            lo, hi = INDICATORS[ind]["limits"]
            assert lo <= v <= hi and unit == INDICATORS[ind]["unit"] and src == "simulated"


def test_only_planted_or_trend_flags(client):
    """Apart from the planted indicator, any flag must come from a trend, never a single-day jump."""
    for i, crew in enumerate(["crew-1", "crew-2", "crew-3", "crew-4"]):
        planted, _ = sim.PLANTED[i]
        for x in client.get(f"/status/{crew}").json():
            b = x["baseline"]
            if x["indicator"] != planted and b and b["unusual"]:
                assert abs(b["z_prev"]) >= 2, f"{crew} {x['indicator']} flagged on one day"
