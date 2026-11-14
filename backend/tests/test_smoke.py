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


def test_docs_served_offline():
    """/docs must not load Swagger UI (or anything else) from a CDN."""
    c = TestClient(app)
    html = c.get("/docs").text
    assert "/static/swagger/swagger-ui-bundle.js" in html and "cdn." not in html and "tiangolo.com" not in html
    assert c.get("/static/swagger/swagger-ui-bundle.js").status_code == 200
    assert c.get("/static/swagger/swagger-ui.css").status_code == 200
