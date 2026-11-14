from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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
def checkin():
    todo()


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
