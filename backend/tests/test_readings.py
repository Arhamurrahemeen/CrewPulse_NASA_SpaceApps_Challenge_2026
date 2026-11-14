import json

import pytest
from fastapi.testclient import TestClient

import db
import main
from rules.engine import INDICATORS, evaluate


@pytest.mark.parametrize("ind,value,status", [
    ("bp_systolic", 119, "green"), ("bp_systolic", 120, "amber"), ("bp_systolic", 139, "amber"),
    ("bp_systolic", 140, "red"), ("bp_systolic", 180, "red"), ("bp_diastolic", 79, "green"),
    ("bp_diastolic", 80, "amber"), ("bp_diastolic", 90, "red"),
    ("glucose_fasting", 53, "red"), ("glucose_fasting", 54, "amber"), ("glucose_fasting", 70, "green"),
    ("glucose_fasting", 99, "green"), ("glucose_fasting", 100, "amber"), ("glucose_fasting", 126, "red"),
    ("sleep_hours", 4.9, "red"), ("sleep_hours", 5, "amber"), ("sleep_hours", 6, "green"),
    ("heart_rate", 59, "amber"), ("heart_rate", 100, "green"), ("heart_rate", 101, "amber"),
    ("body_temp", 37.9, "green"), ("body_temp", 38.0, "red"),
    ("spo2", 97, None), ("mood", 3, None),
])
def test_bands(ind, value, status):
    assert evaluate(ind, value)["status"] == status


def test_escalation_only_at_severe():
    assert not evaluate("bp_systolic", 180)["escalate"]
    assert evaluate("bp_systolic", 181)["escalate"] and evaluate("bp_diastolic", 121)["escalate"]
    assert evaluate("glucose_fasting", 53)["escalate"]


def test_every_band_is_cited():
    for spec in INDICATORS.values():
        for band in spec.get("bands", []):
            assert band["source_title"] and band["source_url"].startswith("https://")
        if "bands" not in spec:
            assert spec["value"] is None and spec["todo"]


def test_wording_rules():
    text = json.dumps(INDICATORS).lower()
    for banned in ("diagnose", "you have", "treatment"):
        assert banned not in text


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    return TestClient(main.app)


def post(c, *readings):
    return c.post("/readings", json={"crew_id": "c1", "readings": [dict(zip(("indicator", "value", "source"), r)) for r in readings]})


def test_validation(client):
    assert post(client, ("heart_rate", 300, "manual")).status_code == 422
    assert post(client, ("bp_systolic", 120, "manual")).status_code == 422  # diastolic missing
    assert post(client, ("bp_systolic", 80, "manual"), ("bp_diastolic", 90, "manual")).status_code == 422
    assert post(client, ("glucose_fasting", 90, "oximeter")).status_code == 422
    assert post(client, ("mood", 2.5, "manual")).status_code == 422
    assert post(client, ("heart_rate", 70, "camera")).status_code == 422  # camera only via /checkin
    assert client.get("/readings", params={"crew_id": "c1"}).json() == []


def test_log_then_status(client):
    r = post(client, ("heart_rate", 64, "oximeter"), ("spo2", 97, "oximeter"),
             ("bp_systolic", 142, "manual"), ("bp_diastolic", 78, "manual"), ("sleep_hours", 5.5, "manual"))
    assert r.status_code == 200 and r.json()["saved"] == 5
    s = {x["indicator"]: x for x in client.get("/status/c1").json()}
    assert s["heart_rate"]["status"] == "green" and s["heart_rate"]["source"] == "oximeter"
    assert s["bp_systolic"]["status"] == "red" and s["bp_systolic"]["unit"] == "mmHg"
    assert s["sleep_hours"]["status"] == "amber" and s["sleep_hours"]["source_url"]
    assert s["spo2"]["status"] is None and s["spo2"]["value"] == 97

    post(client, ("heart_rate", 105, "manual"))
    assert {x["indicator"]: x for x in client.get("/status/c1").json()}["heart_rate"]["value"] == 105
