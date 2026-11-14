"""Cabin environment log: band edges from NASA-STD-3001 Vol 2 Rev F, POST validation, GET latest + series."""

import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

import db
import main
from rules.engine import ENVIRONMENT, evaluate

# [V2 6004] ppCO2 1-hour average <= 3 mmHg. [V2 6012] health limits 18-27 °C / 25-75 % RH (Figure 6.2-2 corners).
# [V2 6013] performance zone 20-25 °C / 30-60 % RH.
BOUNDARIES = [
    ("co2_mmhg", 3.0, "green", "At or below 3"),
    ("co2_mmhg", 3.1, "amber", "Above 3"),
    ("temp_c", 17.9, "red", "Below 18"),
    ("temp_c", 18, "amber", "18-20"),
    ("temp_c", 19.9, "amber", "18-20"),
    ("temp_c", 20, "green", "20-25"),
    ("temp_c", 25.0, "green", "20-25"),
    ("temp_c", 25.1, "amber", "25-27"),
    ("temp_c", 27.0, "amber", "25-27"),
    ("temp_c", 27.1, "red", "Above 27"),
    ("humidity_pct", 24, "red", "Below 25"),
    ("humidity_pct", 25, "amber", "25-30"),
    ("humidity_pct", 29, "amber", "25-30"),
    ("humidity_pct", 30, "green", "30-60"),
    ("humidity_pct", 60, "green", "30-60"),
    ("humidity_pct", 61, "amber", "61-75"),
    ("humidity_pct", 75, "amber", "61-75"),
    ("humidity_pct", 76, "red", "Above 75"),
]


@pytest.mark.parametrize("ind,value,status,label", BOUNDARIES)
def test_boundary(ind, value, status, label):
    r = evaluate(ind, value)
    assert r["status"] == status and r["band"].startswith(label) and r["guidance"]
    assert r["source_url"] == "https://www.nasa.gov/reference/nasa-std-3001v2/"


def test_every_edge_tested_and_wording():
    tested = {(i, v) for i, v, *_ in BOUNDARIES}
    for ind, spec in ENVIRONMENT.items():
        for band in spec["bands"]:
            if "below" in band:
                assert (ind, band["below"]) in tested, f"{ind} edge {band['below']}"
    text = json.dumps(ENVIRONMENT).lower()
    assert not any(w in text for w in ("diagnos", "you have", "treatment"))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    return TestClient(main.app)


def test_post_and_get(client):
    r = client.post("/environment", json={"co2_mmhg": 3.46, "temp_c": 22.04, "humidity_pct": 45.4})
    assert r.status_code == 200 and r.json()["values"] == {"co2_mmhg": 3.5, "temp_c": 22.0, "humidity_pct": 45}
    client.post("/environment", json={"temp_c": 26})  # partial entry: only temperature
    body = client.get("/environment").json()
    latest = {x["indicator"]: x for x in body["latest"]}
    assert latest["co2_mmhg"]["value"] == 3.5 and latest["co2_mmhg"]["status"] == "amber"
    assert latest["temp_c"]["value"] == 26 and latest["temp_c"]["status"] == "amber"
    assert latest["humidity_pct"]["status"] == "green"
    series = {s["indicator"]: s for s in body["series"]}
    assert len(series["temp_c"]["points"]) == 2 and len(series["co2_mmhg"]["points"]) == 1
    assert series["temp_c"]["unit"] == "°C" and series["temp_c"]["bands"][0]["status"] == "red"
    newest, older = body["rows"]
    assert newest["temp_c"] == {"value": 26, "status": "amber"} and newest["co2_mmhg"] is None
    assert older["humidity_pct"] == {"value": 45, "status": "green"}


def test_uncited_parameter_has_no_colour(client, monkeypatch):
    """A parameter without cited bands in thresholds.json is shown, but never coloured."""
    import rules.engine as eng
    monkeypatch.setitem(eng.SPECS, "humidity_pct", {k: v for k, v in eng.ENVIRONMENT["humidity_pct"].items() if k != "bands"})
    client.post("/environment", json={"humidity_pct": 90})
    body = client.get("/environment").json()
    assert body["latest"][0]["status"] is None and body["latest"][0]["source_url"] is None
    assert body["rows"][0]["humidity_pct"] == {"value": 90, "status": None}


def test_validation(client):
    assert client.post("/environment", json={}).status_code == 422
    r = client.post("/environment", json={"humidity_pct": 120, "co2_mmhg": -1})
    assert r.status_code == 422 and len(r.json()["detail"]) == 2
    assert client.get("/environment").json() == {"days": 30, "latest": [], "series": [], "rows": []}


def test_old_ppm_column_migrated(tmp_path):
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE environment (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, co2_ppm REAL, temp_c REAL, humidity_pct REAL)")
    conn.commit()
    conn.close()
    cols = [r[1] for r in db.connect(path).execute("PRAGMA table_info(environment)")]
    assert "co2_mmhg" in cols and "co2_ppm" not in cols
