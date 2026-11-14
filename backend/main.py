from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

import db
from donki import client as donki
from baseline import engine as baseline_engine
from rppg import checkin as rppg_checkin
from rules import engine

app = FastAPI(title="CrewPulse")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")


def todo():
    raise HTTPException(501, "not implemented yet")


def now():
    return datetime.now(timezone.utc).isoformat()


class ReadingIn(BaseModel):
    indicator: str
    value: float
    source: Literal["manual", "oximeter"] = "manual"  # camera -> /checkin, simulated -> sim.generate


class ReadingsIn(BaseModel):
    crew_id: str = Field(min_length=1)
    readings: list[ReadingIn] = Field(min_length=1)


@app.post("/readings")
def add_readings(body: ReadingsIn):
    """Store one log entry (several indicators, same timestamp). Server is the validation authority."""
    errors = []
    by_ind = {}
    for r in body.readings:
        try:
            engine.check_value(r.indicator, r.value)
        except ValueError as e:
            errors.append(str(e))
            continue
        if r.source == "oximeter" and r.indicator not in ("heart_rate", "spo2"):
            errors.append(f"{r.indicator} cannot come from an oximeter")
        by_ind[r.indicator] = r.value
    if ("bp_systolic" in by_ind) != ("bp_diastolic" in by_ind):
        errors.append("Enter both systolic and diastolic blood pressure")
    elif "bp_systolic" in by_ind and by_ind["bp_systolic"] <= by_ind["bp_diastolic"]:
        errors.append("Systolic must be higher than diastolic")
    if len({r.indicator for r in body.readings}) != len(body.readings):
        errors.append("Each indicator can appear only once per entry")
    if errors:
        raise HTTPException(422, errors)

    ts = now()
    conn = db.connect()
    with conn:
        conn.executemany(
            "INSERT INTO reading (crew_id, ts, indicator, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)",
            [(body.crew_id, ts, r.indicator, r.value, engine.INDICATORS[r.indicator]["unit"], r.source) for r in body.readings],
        )
    conn.close()
    return {"saved": len(body.readings), "ts": ts}


@app.get("/readings")
def list_readings(crew_id: str, indicator: str | None = None, limit: int = 100):
    sql = "SELECT * FROM reading WHERE crew_id = ?" + (" AND indicator = ?" if indicator else "") + " ORDER BY ts DESC LIMIT ?"
    conn = db.connect()
    rows = conn.execute(sql, (crew_id, indicator, limit) if indicator else (crew_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/checkin")
def checkin(crew_id: str):
    """Blocking 30 s webcam scan. Only an accepted scan is stored and returns a bpm."""
    try:
        result = rppg_checkin.scan()
    except rppg_checkin.ScanCancelled:
        return {"bpm": None, "accepted": False, "cancelled": True, "message": "Scan cancelled."}
    except RuntimeError as e:  # no camera / no face model
        raise HTTPException(503, str(e))
    if not result["accepted"]:
        return {**result, "bpm": None, "message": "Signal too weak. Please re-scan: stay still, face the light."}
    ts = now()
    conn = db.connect()
    with conn:
        conn.execute(
            "INSERT INTO reading (crew_id, ts, indicator, value, unit, source, quality) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (crew_id, ts, "heart_rate", result["bpm"], "bpm", "camera", result["quality_db"]),
        )
    conn.close()
    return {**result, "ts": ts}


class OximeterPair(BaseModel):
    crew_id: str
    camera_ts: str
    bpm: float


@app.post("/checkin/oximeter")
def checkin_oximeter(body: OximeterPair):
    """Oximeter HR read at the end of a camera scan, stored with the scan's timestamp so tools/validate.py pairs them exactly."""
    try:
        engine.check_value("heart_rate", body.bpm)
    except ValueError as e:
        raise HTTPException(422, [str(e)])
    conn = db.connect()
    sources = {r[0] for r in conn.execute(
        "SELECT source FROM reading WHERE crew_id = ? AND ts = ? AND indicator = 'heart_rate'", (body.crew_id, body.camera_ts))}
    if "camera" not in sources:
        conn.close()
        raise HTTPException(404, "No camera scan with that timestamp")
    if "oximeter" in sources:
        conn.close()
        raise HTTPException(409, "This scan already has an oximeter value")
    with conn:
        conn.execute(
            "INSERT INTO reading (crew_id, ts, indicator, value, unit, source) VALUES (?, ?, 'heart_rate', ?, 'bpm', 'oximeter')",
            (body.crew_id, body.camera_ts, body.bpm),
        )
    conn.close()
    return {"saved": 1, "ts": body.camera_ts}


@app.get("/status/{crew_id}")
def status(crew_id: str):
    """Latest reading per indicator with its colour, guidance, source and personal-baseline comparison."""
    conn = db.connect()
    rows = [dict(r) for r in conn.execute("SELECT * FROM reading WHERE crew_id = ? ORDER BY ts, id", (crew_id,))]
    conn.close()
    by_ind = {}
    for r in rows:
        by_ind.setdefault(r["indicator"], []).append(r)
    # ponytail: loads the crew's full history per call; fine for months of data, add a ts cut-off if it grows to years
    return [
        {**by_ind[ind][-1], "label": spec["label"], **engine.evaluate(ind, by_ind[ind][-1]["value"]),
         "baseline": baseline_engine.baseline([(r["ts"], r["value"]) for r in by_ind[ind]], spec["unit"])}
        for ind, spec in engine.INDICATORS.items() if ind in by_ind
    ]


@app.get("/trends/{crew_id}")
def trends(crew_id: str, indicator: str | None = None, days: int = Query(30, ge=1, le=365)):
    """Readings of the last `days` days (all indicators, or one) with unit, cited bands and source for charting."""
    if indicator is not None and indicator not in engine.INDICATORS:
        raise HTTPException(404, f"unknown indicator {indicator!r}")
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    conn = db.connect()
    rows = conn.execute(
        "SELECT indicator, ts, value, source FROM reading WHERE crew_id = ? AND ts >= ?"
        + (" AND indicator = ?" if indicator else "") + " ORDER BY ts, id",
        (crew_id, since, indicator) if indicator else (crew_id, since),
    ).fetchall()
    conn.close()
    points = {}
    for r in rows:
        points.setdefault(r["indicator"], []).append({"ts": r["ts"], "value": r["value"], "source": r["source"]})
    return {
        "days": days,
        "indicators": [
            {"indicator": ind, "label": spec["label"], "unit": spec["unit"], "bands": engine.bands(ind),
             "source_title": spec.get("source_title"), "source_url": spec.get("source_url"), "points": points[ind]}
            for ind, spec in engine.INDICATORS.items() if ind in points
        ],
    }


@app.post("/environment")
def add_environment():
    todo()


@app.get("/environment")
def list_environment():
    todo()


@app.post("/symptoms")
def add_symptom():
    todo()


@app.get("/symptoms")
def list_symptoms():
    todo()


@app.get("/radiation")
def radiation(mission_days: int = Query(90, ge=1, le=1000), refresh: bool = False):
    """Cached DONKI events (refreshed when online and older than 6 h) + an estimated mission dose."""
    data, offline = donki.load(), False
    age_h = None if data is None else (datetime.now(timezone.utc) - datetime.fromisoformat(data["fetched_at"])).total_seconds() / 3600
    if refresh or data is None or age_h > 6:
        try:
            data, age_h = donki.refresh(), 0.0
        except httpx.HTTPError:
            offline = True  # keep serving the cache
    if data is None:
        raise HTTPException(503, "No cached space-weather data yet and DONKI is unreachable. Connect once to fetch it.")
    counts = {t: sum(e["type"] == t for e in data["events"]) for t in donki.TYPES}
    return {**data, "age_hours": round(age_h, 1), "offline": offline, "counts": counts,
            "dose": donki.estimate_dose(mission_days), "credit": donki.CREDIT}
