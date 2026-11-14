"""POST/GET /readings and GET /status. Band edges live in test_rules.py."""

import pytest
from fastapi.testclient import TestClient

import db
import main


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
             ("bp_systolic", 185, "manual"), ("bp_diastolic", 78, "manual"), ("sleep_hours", 5.5, "manual"))
    assert r.status_code == 200 and r.json()["saved"] == 5
    s = {x["indicator"]: x for x in client.get("/status/c1").json()}

    sys_ = s["bp_systolic"]
    assert (sys_["status"], sys_["escalate_to_flight_surgeon"], sys_["unit"]) == ("red", True, "mmHg")
    assert sys_["guidance"] and sys_["source_title"] and sys_["source_url"]
    assert s["sleep_hours"]["status"] == "amber" and not s["sleep_hours"]["escalate_to_flight_surgeon"]
    assert s["spo2"]["status"] is None and s["spo2"]["source_url"] is None and s["spo2"]["value"] == 97  # no cited threshold
    assert s["heart_rate"]["status"] == "green" and s["heart_rate"]["source"] == "oximeter"

    post(client, ("heart_rate", 105, "manual"))
    assert {x["indicator"]: x for x in client.get("/status/c1").json()}["heart_rate"]["value"] == 105


def test_status_unknown_crew_is_empty(client):
    assert client.get("/status/nobody").json() == []


def test_stress_and_hrv(client):
    assert post(client, ("stress", 11, "manual")).status_code == 422
    assert post(client, ("stress", 2.5, "manual")).status_code == 422
    assert post(client, ("hrv_rmssd", 42.5, "oximeter")).status_code == 422  # HRV is typed from a device, not an oximeter
    assert post(client, ("stress", 0, "manual"), ("hrv_rmssd", 42.5, "manual")).status_code == 200  # 0 is a valid stress
    s = {x["indicator"]: x for x in client.get("/status/c1").json()}
    assert (s["stress"]["value"], s["stress"]["unit"], s["stress"]["status"]) == (0, "/10", None)
    assert (s["hrv_rmssd"]["value"], s["hrv_rmssd"]["unit"], s["hrv_rmssd"]["status"]) == (42.5, "ms", None)
