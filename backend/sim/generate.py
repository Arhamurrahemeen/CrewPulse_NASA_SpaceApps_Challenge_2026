"""Simulated crew history (source="simulated"), seeded and reproducible.

    python -m sim.generate --crew 4 --days 90 --seed 42

Values are illustrative, not a physiological model. Daily base values sit inside the cited green
ranges of rules/thresholds.json; spaceflight effects are added only where a CLAUDE.md source
describes them, and every assumption beyond the source is marked ASSUMPTION. The history ends now,
so the Dashboard and the 7/30/90-day Trends show it. Re-running replaces the simulated rows of the
generated crew members only; real readings are never touched.
"""

import argparse
from datetime import datetime, timedelta, timezone

import numpy as np

import db
from rules.engine import INDICATORS

# Per-day log schedule: every N days (ASSUMPTION: plausible self-check routine).
EVERY = {"heart_rate": 1, "body_temp": 1, "sleep_hours": 1, "mood": 1, "stress": 1, "hrv_rmssd": 1,
         "bp_systolic": 2, "bp_diastolic": 2, "spo2": 2, "glucose_fasting": 3, "bone_tibia_bmd_pct": 7}
DECIMALS = {"body_temp": 1, "sleep_hours": 2, "hrv_rmssd": 1, "bone_tibia_bmd_pct": 2}

# Planted anomaly per crew member: today AND yesterday shifted the same way, so the 2-consecutive-day
# baseline rule fires on the Dashboard. These are demo events, not modelled physiology.
PLANTED = [
    ("heart_rate", +14),   # still in the AHA 60-100 green range, but unusual for this person
    ("sleep_hours", -2.2),  # two short nights
    ("bp_systolic", +22),  # moves into the AHA elevated / stage 1 range
    ("body_temp", +1.0),   # below the CDC 38 °C fever line, but unusual: early-warning demo
]


def profile(rng):
    """Personal means/SDs. Means are drawn inside cited green ranges; SDs are ASSUMPTIONS."""
    return {
        # AHA: normal resting HR 60-100 bpm.
        "heart_rate": (rng.uniform(60, 72), 2.5),
        # 2025 AHA/ACC: normal BP < 120 / < 80 mmHg.
        "bp_systolic": (rng.uniform(106, 116), 4.0),
        "bp_diastolic": (rng.uniform(66, 75), 3.0),
        # ADA 2026 Sec. 2: fasting glucose below 100 mg/dL (and >= 70, Table 6.4) is below the IFG range.
        "glucose_fasting": (rng.uniform(80, 92), 4.0),
        # CDC: fever is 38 °C or more. No CLAUDE.md source gives a normal mean, so ASSUMPTION: 36.4-36.8 °C.
        "body_temp": (rng.uniform(36.4, 36.8), 0.15),
        # No CLAUDE.md source for SpO2 (thresholds.json value null). ASSUMPTION: typical 96-98 %.
        "spo2": (rng.uniform(96, 98), 0.7),
        # Jones et al., SLEEP 2022: astronauts reported sleeping ~6.5 h in flight.
        "sleep_hours": (6.5, 0.45),
        # No cited norm (thresholds.json value null). ASSUMPTION: illustrative self-ratings.
        "mood": (rng.uniform(3.5, 4.2), 0.6),
        "stress": (rng.uniform(2.0, 3.5), 0.9),
        # No verified RMSSD norm (Nunan et al. 2010 values are method-dependent). ASSUMPTION: 30-60 ms.
        "hrv_rmssd": (rng.uniform(30, 60), 5.0),
    }


def crew_series(rng, days):
    """-> {indicator: np.array of length `days`} (index days-1 = today)."""
    p = profile(rng)
    s = {ind: rng.normal(mean, sd, days) for ind, (mean, sd) in p.items()}

    # Jones et al., SLEEP 2022: sleep < 5 h occurs in flight and is associated with elevated negative somatic
    # states; < 6 h with elevated stress. ASSUMPTION: 3 episodes of 1-2 nights at 4.2-4.9 h, and +2 on the 0-10
    # stress self-report those days (the source gives the direction of the association, not its size).
    for start in rng.choice(np.arange(5, days - 12), size=3, replace=False):  # kept clear of the last days
        for d in range(start, start + rng.integers(1, 3)):
            s["sleep_hours"][d] = rng.uniform(4.2, 4.9)
            s["stress"][d] += 2

    # Gabel et al., Sci Rep 2022 (Table 1): median tibia total BMD change at return -3.4 % (HR-pQCT).
    # ASSUMPTION: linear loss over a 180-day mission and 0.15 % scan-to-scan noise; the paper only measured
    # before and after flight, never in flight.
    s["bone_tibia_bmd_pct"] = -3.4 / 180 * np.arange(1, days + 1) + rng.normal(0, 0.15, days)

    # Demo only, NOT a spaceflight effect: no CLAUDE.md source describes daily resting-HR anomalies
    # (Krittanawong 2023 reports more ventricular ectopy, which does not shift a daily mean). Two one-day spikes
    # show that the 2-consecutive-day rule ignores single outliers.
    for d in rng.choice(np.arange(10, days - 12), size=2, replace=False):
        s["heart_rate"][d] += 15
    return s


def rows_for(crew_id, series, days, now, rng, forced=()):
    """One timestamp per day shared by all indicators (so a BP pair stays a pair). `forced` indicators are
    also logged yesterday and today regardless of their schedule, so the planted anomaly has both days."""
    day_ts = [(now - timedelta(days=days - 1 - d, minutes=int(rng.integers(0, 120)))).isoformat() for d in range(days)]
    rows = []
    for ind, values in series.items():
        lo, hi = INDICATORS[ind]["limits"]
        unit = INDICATORS[ind]["unit"]
        for d in range(days):
            ago = days - 1 - d
            if ago % EVERY[ind] and not (ind in forced and ago < 2):
                continue
            v = float(np.clip(values[d], lo, hi))
            v = round(v, DECIMALS[ind]) if ind in DECIMALS else float(round(v))
            rows.append((crew_id, day_ts[d], ind, v, unit, "simulated"))
    return rows


def generate(n_crew=4, days=90, seed=42, now=None):
    now = now or datetime.now(timezone.utc)
    rng = np.random.default_rng(seed)
    out = {}
    for i in range(n_crew):
        crew_id = f"crew-{i + 1}"
        series = crew_series(rng, days)
        ind, shift = PLANTED[i % len(PLANTED)]
        series[ind][-2:] = np.median(series[ind][-30:-2]) + shift  # yesterday and today
        forced = {ind, "bp_diastolic"} if ind == "bp_systolic" else {ind}
        out[crew_id] = rows_for(crew_id, series, days, now, rng, forced)
    return out


def write(by_crew, path=None):
    conn = db.connect(path)
    with conn:
        for crew_id, rows in by_crew.items():
            conn.execute("DELETE FROM reading WHERE crew_id = ? AND source = 'simulated'", (crew_id,))
            conn.executemany("INSERT INTO reading (crew_id, ts, indicator, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)", rows)
    conn.close()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Generate simulated crew history.")
    ap.add_argument("--crew", type=int, default=4)
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--db", default=None, help="SQLite path (default: backend/crewpulse.db)")
    a = ap.parse_args(argv)
    if a.days < 30:
        ap.error("--days must be at least 30 (episodes and baselines need history)")
    by_crew = generate(a.crew, a.days, a.seed)
    write(by_crew, a.db)
    for i, (crew_id, rows) in enumerate(by_crew.items()):
        ind, shift = PLANTED[i % len(PLANTED)]
        print(f"{crew_id}: {len(rows)} simulated readings; planted anomaly: {ind} {shift:+} (yesterday + today)")


if __name__ == "__main__":
    main()
