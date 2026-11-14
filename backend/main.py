from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

import db
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
         "baseline": baseline_engine.baseline([(r["ts"], r["value"]) for r in by_ind[ind]])}
        for ind, spec in engine.INDICATORS.items() if ind in by_ind
    ]


@app.get("/trends/{crew_id}")
def trends(crew_id: str, indicator: str, days: int = 30):
    todo()


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
def radiation():
    todo()
