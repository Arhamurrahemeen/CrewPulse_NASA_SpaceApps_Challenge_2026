"""Body-map symptoms: validation, per-crew listing, time window."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import db
import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    return TestClient(main.app)


def test_post_and_list(client):
    r = client.post("/symptoms", json={"crew_id": "c1", "body_part": "lower_back", "severity_1_5": 3, "note": "  stiff after sleep  "})
    assert r.status_code == 200
    client.post("/symptoms", json={"crew_id": "c1", "body_part": "head", "severity_1_5": 2, "note": "   "})
    client.post("/symptoms", json={"crew_id": "c2", "body_part": "head", "severity_1_5": 5})
    rows = client.get("/symptoms", params={"crew_id": "c1"}).json()
    assert [x["body_part"] for x in rows] == ["head", "lower_back"]  # newest first, only c1
    assert rows[1]["note"] == "stiff after sleep" and rows[0]["note"] is None


@pytest.mark.parametrize("bad", [
    {"body_part": "tail", "severity_1_5": 2},
    {"body_part": "head", "severity_1_5": 0},
    {"body_part": "head", "severity_1_5": 6},
    {"body_part": "head", "severity_1_5": 2.5},
    {"body_part": "head", "severity_1_5": 2, "note": "x" * 501},
])
def test_validation(client, bad):
    assert client.post("/symptoms", json={"crew_id": "c1", **bad}).status_code == 422


def test_every_region_accepted(client):
    for part in main.BODY_PARTS:
        assert client.post("/symptoms", json={"crew_id": "c1", "body_part": part, "severity_1_5": 1}).status_code == 200


def test_days_window(client):
    old = (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
    conn = db.connect()
    with conn:
        conn.execute("INSERT INTO symptom (crew_id, ts, body_part, severity_1_5) VALUES ('c1', ?, 'chest', 2)", (old,))
    conn.close()
    assert client.get("/symptoms", params={"crew_id": "c1"}).json() == []
    assert len(client.get("/symptoms", params={"crew_id": "c1", "days": 30}).json()) == 1
