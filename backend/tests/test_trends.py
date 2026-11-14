from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import db
import main
from rules.engine import bands


def test_bands_cover_limits_contiguously():
    b = bands("bp_systolic")
    assert [x["status"] for x in b] == ["green", "amber", "amber", "red", "red"]
    assert b[0]["from"] == 50 and b[-1]["to"] == 260
    assert all(a["to"] == c["from"] for a, c in zip(b, b[1:]))
    assert bands("spo2") == []  # no cited threshold, no bands


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    now = datetime.now(timezone.utc)
    rows = [("c1", (now - timedelta(days=d)).isoformat(), "heart_rate", 60 + d, "bpm", "simulated" if d > 3 else "manual")
            for d in (0, 2, 10, 40, 100)]
    rows.append(("c1", now.isoformat(), "spo2", 97, "%", "oximeter"))
    rows.append(("c2", now.isoformat(), "heart_rate", 99, "bpm", "manual"))
    conn = db.connect()
    with conn:
        conn.executemany("INSERT INTO reading (crew_id, ts, indicator, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)", rows)
    conn.close()
    return TestClient(main.app)


def test_days_window(client):
    for days, n in ((7, 2), (30, 3), (90, 4)):
        hr = client.get("/trends/c1", params={"days": days}).json()["indicators"][0]
        assert hr["indicator"] == "heart_rate" and len(hr["points"]) == n


def test_payload(client):
    data = client.get("/trends/c1", params={"days": 30}).json()
    hr, spo2 = data["indicators"]
    assert [p["value"] for p in hr["points"]] == [70, 62, 60]  # oldest first
    assert {p["source"] for p in hr["points"]} == {"simulated", "manual"}
    assert hr["unit"] == "bpm" and hr["bands"] and hr["source_url"]
    assert spo2["bands"] == [] and spo2["source_url"] is None


def test_filter_and_errors(client):
    one = client.get("/trends/c1", params={"indicator": "spo2"}).json()["indicators"]
    assert [x["indicator"] for x in one] == ["spo2"]
    assert client.get("/trends/c1", params={"indicator": "nope"}).status_code == 404
    assert client.get("/trends/c1", params={"days": 0}).status_code == 422
    assert client.get("/trends/nobody").json()["indicators"] == []
