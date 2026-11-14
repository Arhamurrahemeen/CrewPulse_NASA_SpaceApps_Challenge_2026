"""Demo snapshot: only simulated crew, labelled, real database untouched, globals restored."""

import json

import db
from donki import client as donki
from sim import export_demo


def test_export(tmp_path, monkeypatch):
    real = tmp_path / "real.db"
    monkeypatch.setattr(db, "DB_PATH", real)
    monkeypatch.setattr(donki, "load", lambda path=None: {"fetched_at": "2026-11-14T00:00:00+00:00", "start": "2026-10-15",
                                                            "end": "2026-11-14", "api": "x", "events": []})
    refresh = donki.refresh
    out, data = export_demo.export(tmp_path / "data.json")

    assert db.DB_PATH == real and donki.refresh is refresh and not real.exists()
    assert json.loads(out.read_text(encoding="utf-8"))["crew"] == ["crew-1", "crew-2", "crew-3", "crew-4"]
    for crew in data["crew"]:
        assert {x["source"] for x in data["status"][crew]} == {"simulated"}
        assert {p["source"] for s in data["trends"][crew] for p in s["points"]} == {"simulated"}
    env = data["environment"]
    assert {x["source"] for x in env["latest"] + env["rows"]} == {"simulated"} and len(env["series"]) == 3
    assert data["radiation"]["dose"]["is_estimate"] and len(data["radiation"]["dose_per_day_msv"]) == 2
