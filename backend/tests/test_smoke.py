import sqlite3

import pytest
from fastapi.testclient import TestClient

from db import connect
from main import app


def test_schema():
    conn = connect(":memory:")
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"reading", "symptom", "environment", "radiation_event"} <= tables
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO reading (crew_id, ts, indicator, value, unit, source) VALUES ('c1','t','hr',60,'bpm','guess')")


def test_stub_routes():
    c = TestClient(app)
    assert c.get("/status/c1").status_code == 501
    assert c.get("/radiation").status_code == 501
