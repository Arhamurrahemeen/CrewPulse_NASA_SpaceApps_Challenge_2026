import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import db

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import validate  # noqa: E402

T0 = datetime(2026, 11, 14, 10, 0, tzinfo=timezone.utc)


def test_agreement_known_values():
    s = validate.agreement([62, 70, 85], [60, 72, 80])  # diffs +2, -2, +5
    assert s["mae"] == pytest.approx(3.0)
    assert s["bias"] == pytest.approx(5 / 3)
    sd = s["sd"]
    assert s["loa"] == pytest.approx((5 / 3 - 1.96 * sd, 5 / 3 + 1.96 * sd))
    assert s["within_criterion_pct"] == pytest.approx(100.0)  # 5 <= max(5, 8.0)


def test_criterion_is_greater_of_5bpm_or_10pct():
    assert validate.within_criterion(-6, 60)  # 10 % of 60 = 6, boundary is inside
    assert not validate.within_criterion(-6.1, 60)
    assert validate.within_criterion(12, 120)  # 10 % of 120 = 12
    assert validate.within_criterion(5, 40) and not validate.within_criterion(5.1, 40)  # 5 bpm floor


def test_pairing_window_and_single_use():
    cam = [(T0, 70, 9.0), (T0 + timedelta(seconds=30), 72, 12.0), (T0 + timedelta(hours=1), 80, 8.0)]
    oxi = [(T0 + timedelta(seconds=40), 71)]
    pairs = validate.pair(cam, oxi, window_s=120)
    assert pairs == [(70, 71, 9.0)]  # first camera reading claims it; 1 h later is outside the window


def test_main_end_to_end(tmp_path, capsys):
    path = tmp_path / "t.db"
    conn = db.connect(path)
    rows = []
    for i, (c, o, q) in enumerate([(66, 64, 9.8), (90, 70, 4.2), (61, 60, 15.0), (75, 74, 12.5)]):
        t = T0 + timedelta(minutes=10 * i)
        rows += [("c1", t.isoformat(), "heart_rate", c, "bpm", "camera", q),
                 ("c1", (t + timedelta(seconds=45)).isoformat(), "heart_rate", o, "bpm", "oximeter", None)]
    with conn:
        conn.executemany("INSERT INTO reading (crew_id, ts, indicator, value, unit, source, quality) "
                         "VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    conn.close()

    out = tmp_path / "ba.png"
    validate.main(["--crew", "c1", "--db", str(path), "--out", str(out)])
    text = capsys.readouterr().out
    assert "4 pairs" in text and "MAE   6.0 bpm" in text
    assert "12.5      2       1.0" in text  # gate at 12.5 dB keeps the 2 good scans
    assert out.stat().st_size > 10_000


def test_too_few_pairs_exits(tmp_path):
    path = tmp_path / "t.db"
    db.connect(path).close()
    with pytest.raises(SystemExit):
        validate.main(["--crew", "c1", "--db", str(path), "--out", str(tmp_path / "x.png")])
