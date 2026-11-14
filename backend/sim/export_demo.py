"""Snapshot for the VITE_DEMO_MODE build (public hosted link, no backend):

    python -m sim.export_demo     ->  frontend/src/demo/data.json

Runs the real API against a throwaway database filled with the seeded simulated crew (never your real
readings), plus the cached DONKI events (run `python -m donki.client` first when online). Everything health-
or cabin-related in the file is simulated and labelled so.
"""

import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import numpy as np
from fastapi.testclient import TestClient

import db
import main
from donki import client as donki
from sim import generate as sim

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "demo" / "data.json"
CREW = [f"crew-{i}" for i in range(1, 5)]
DAYS = 90


def cabin_rows(now, rng):
    """Simulated cabin log, one entry a day. ASSUMPTIONS (illustrative, not ISS telemetry): CO2 around 2.3 mmHg
    (OCHMO-TB-004: ISS kept at or below a 3 mmHg 24-hour average), 22.5 °C and 45 % RH (inside the [V2 6013]
    performance zone), plus a two-day CO2 rise above 3 mmHg so the amber state can be demoed."""
    rows = []
    for d in range(DAYS):
        ago = DAYS - 1 - d
        co2 = rng.normal(2.3, 0.25) + (1.1 if ago in (11, 12) else 0)
        rows.append(((now - timedelta(days=ago, minutes=int(rng.integers(0, 120)))).isoformat(),
                     round(float(co2), 1), round(float(rng.normal(22.5, 0.6)), 1), int(round(rng.normal(45, 5)))))
    return rows


def snapshot(now):
    """Call the real API routes (TestClient) against the current db.DB_PATH."""
    sim.write(sim.generate(len(CREW), DAYS, 42, now=now))
    conn = db.connect()
    with conn:
        conn.executemany("INSERT INTO environment (ts, co2_mmhg, temp_c, humidity_pct) VALUES (?, ?, ?, ?)",
                         cabin_rows(now, np.random.default_rng(42)))
    conn.close()
    c = TestClient(main.app)
    get = lambda path: c.get(path).raise_for_status().json()  # noqa: E731
    env = get(f"/environment?days={DAYS}")
    for x in env["latest"] + [p for s in env["series"] for p in s["points"]]:
        x["source"] = "simulated"  # the environment table has no source column
    return {
        "exported_at": now.isoformat(),
        "crew": CREW,
        "status": {crew: get(f"/status/{crew}") for crew in CREW},
        "trends": {crew: get(f"/trends/{crew}?days={DAYS}")["indicators"] for crew in CREW},
        "environment": env,
        "radiation": {**get("/radiation"), "offline": False,
                      "dose_per_day_msv": [d / donki.SIX_MONTHS_DAYS for d in donki.ISS_DOSE_6MO_MSV]},
    }


def _no_fetch():
    raise httpx.HTTPError("demo export never fetches")


def export(out=OUT):
    if donki.load() is None:
        raise SystemExit("No DONKI cache. Run `python -m donki.client` once while online.")
    saved = db.DB_PATH, donki.refresh
    with tempfile.TemporaryDirectory() as tmp:
        try:
            db.DB_PATH, donki.refresh = Path(tmp) / "demo.db", _no_fetch  # never the real DB; serve the cache as is
            data = snapshot(datetime.now(timezone.utc))
        finally:
            db.DB_PATH, donki.refresh = saved
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out, data

if __name__ == "__main__":
    path, d = export()
    print(f"Wrote {path} ({path.stat().st_size // 1024} kB): {len(d['crew'])} simulated crew, "
          f"{len(d['radiation']['events'])} DONKI events, {DAYS} days of simulated cabin data")
