from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

import db
import main
from baseline.engine import MIN_DAYS, baseline, daily_means

DAY0 = datetime(2026, 10, 1, 8, 0, tzinfo=timezone.utc)


def series(values, start=DAY0):
    """One reading per day."""
    return [((start + timedelta(days=i)).isoformat(), v) for i, v in enumerate(values)]


def noisy(n, mean=60, sd=1.5, seed=1):
    return list(np.random.default_rng(seed).normal(mean, sd, n))


def test_daily_means_average_within_a_day():
    r = [(DAY0.isoformat(), 60), ((DAY0 + timedelta(hours=5)).isoformat(), 70), ((DAY0 + timedelta(days=1)).isoformat(), 65)]
    assert [v for _, v in daily_means(r)] == [65.0, 65.0]


def test_not_ready_until_min_days():
    b = baseline(series(noisy(MIN_DAYS + 1)))  # today and yesterday are not history
    assert not b["ready"] and b["n_days"] == MIN_DAYS - 1 and not b["unusual"] and b["z"] is None
    assert baseline(series(noisy(MIN_DAYS + 2)))["ready"]


def test_stable_is_not_unusual():
    b = baseline(series(noisy(21) + [60.5]))
    assert b["ready"] and abs(b["z"]) < 2 and not b["unusual"] and not b["trend"]


def test_two_consecutive_days_needed():
    assert baseline(series(noisy(21) + [70, 70]))["unusual"]
    assert baseline(series(noisy(21) + [50, 50]))["unusual"]
    one = baseline(series(noisy(21) + [60, 70]))  # only today is out
    assert one["z"] > 2 and abs(one["z_prev"]) < 2 and not one["unusual"]


def test_opposite_directions_not_unusual():
    b = baseline(series(noisy(21) + [50, 70]))
    assert b["z_prev"] < -2 and b["z"] > 2 and not b["unusual"]


def test_gap_yesterday_not_unusual():
    hist = series(noisy(21))
    today = (DAY0 + timedelta(days=22)).isoformat()  # day 21 (yesterday) missing
    b = baseline(hist[:-1] + [(hist[-1][0], 70), (today, 70)])
    assert b["z_prev"] is None and not b["unusual"]


def test_judged_days_excluded_from_baseline():
    hist = noisy(21)
    b = baseline(series(hist + [90, 90]))
    assert b["mean"] == pytest.approx(np.mean(hist), abs=0.01)
    assert b["sd"] == pytest.approx(np.std(hist, ddof=1), abs=0.01)


def test_window_drops_old_days():
    b = baseline(series([100] * 10 + noisy(30) + [60]))  # the 100s are older than 28 days
    assert b["n_days"] == 28 and b["mean"] == pytest.approx(60, abs=1.5)


def test_rising_week_is_a_trend():
    hist = noisy(21, sd=1.0)
    week = [60 + 1.5 * i for i in range(7)]  # +1.5 bpm/day
    b = baseline(series(hist + week))
    assert b["slope_per_day"] == pytest.approx(1.5, abs=0.3) and b["slope_p"] < 0.05 and b["trend"]


def test_flat_history_has_no_z():
    b = baseline(series([60.0] * 10 + [61.0]))
    assert b["sd"] == 0 and b["z"] is None and not b["unusual"] and not b["trend"]


def test_status_includes_baseline(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    conn = db.connect()
    rows = [("c1", ts, "heart_rate", v, "bpm", "manual") for ts, v in series(noisy(21) + [75, 75])]
    with conn:
        conn.executemany("INSERT INTO reading (crew_id, ts, indicator, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)", rows)
    conn.close()
    hr = TestClient(main.app).get("/status/c1").json()[0]
    assert hr["value"] == 75 and hr["status"] == "green"  # in the cited range...
    assert hr["baseline"]["unusual"] and hr["baseline"]["z"] > 2  # ...but unusual for this person
