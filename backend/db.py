import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "crewpulse.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS reading (
    id INTEGER PRIMARY KEY,
    crew_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    indicator TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('camera', 'manual', 'oximeter', 'simulated')),
    quality REAL
);
CREATE INDEX IF NOT EXISTS reading_crew_ind_ts ON reading (crew_id, indicator, ts);

CREATE TABLE IF NOT EXISTS symptom (
    id INTEGER PRIMARY KEY,
    crew_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    body_part TEXT NOT NULL,
    severity_1_5 INTEGER NOT NULL CHECK (severity_1_5 BETWEEN 1 AND 5),
    note TEXT
);

CREATE TABLE IF NOT EXISTS environment (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    co2_ppm REAL,
    temp_c REAL,
    humidity_pct REAL
);

CREATE TABLE IF NOT EXISTS radiation_event (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    details_json TEXT,
    source TEXT NOT NULL DEFAULT 'donki'
);
"""


def connect(path=DB_PATH):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn
