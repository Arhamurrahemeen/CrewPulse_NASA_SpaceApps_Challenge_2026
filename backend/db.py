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
    co2_mmhg REAL,  -- ppCO2: NASA-STD-3001 [V2 6004] limits partial pressure, not ppm
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


def connect(path=None):
    conn = sqlite3.connect(path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(environment)")}
    if "co2_ppm" in cols:  # pre-2026-11-14 schema, never written to (the routes were 501 stubs)
        if conn.execute("SELECT 1 FROM environment LIMIT 1").fetchone():
            raise RuntimeError("environment.co2_ppm has rows; convert them to mmHg before upgrading")
        conn.execute("ALTER TABLE environment RENAME COLUMN co2_ppm TO co2_mmhg")
    return conn
