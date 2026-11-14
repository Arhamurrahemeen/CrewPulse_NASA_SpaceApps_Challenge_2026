from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import db
from rppg import checkin as rppg_checkin

app = FastAPI(title="CrewPulse")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def todo():
    raise HTTPException(501, "not implemented yet")


@app.post("/readings")
def add_reading():
    todo()


@app.get("/readings")
def list_readings():
    todo()


@app.post("/checkin")
def checkin(crew_id: str):
    """Blocking 30 s webcam scan. Only an accepted scan is stored and returns a bpm."""
    try:
        result = rppg_checkin.scan()
    except RuntimeError as e:  # no camera / no face model
        raise HTTPException(503, str(e))
    if not result["accepted"]:
        return {**result, "bpm": None, "message": "Signal too weak. Please re-scan: stay still, face the light."}
    conn = db.connect()
    with conn:
        conn.execute(
            "INSERT INTO reading (crew_id, ts, indicator, value, unit, source, quality) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (crew_id, datetime.now(timezone.utc).isoformat(), "heart_rate", result["bpm"], "bpm", "camera", result["quality_db"]),
        )
    conn.close()
    return result


@app.get("/status/{crew_id}")
def status(crew_id: str):
    todo()


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
