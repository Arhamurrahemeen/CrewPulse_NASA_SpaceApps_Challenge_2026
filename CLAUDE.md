# CrewPulse — Astronaut Self-Health Monitor (NASA Space Apps 2026)

Hackathon project for NASA Space Apps Challenge 2026, Karachi local event.
Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**.
Team: **OmniteX** — Muhammad Arham (lead), Abdul Awwal. Project name: **CrewPulse**.
**Feature freeze: Sun 15 Nov 15:00 PKT. Submit before 19:00 PKT.** Prefer working and simple over clever.

## What we are building
An **offline-first** dashboard that lets an astronaut assess their own health:
1. Collect readings: heart rate, blood pressure, blood glucose, body temperature, sleep hours, mood (1–5), SpO₂.
   Inputs: manual entry (keyboard/buttons), camera check-in (rPPG heart rate), oximeter value typed in.
2. Colour-code each reading green / amber / red against **cited** thresholds.
3. Flag **unusual changes vs the astronaut's own baseline** (rolling mean ± 2 SD, 7-day trend slope).
4. Show trends over days/weeks (simulated 90-day crew history + real entries).
5. Give plain-English guidance + when to "contact flight surgeons". Decision support, never diagnosis.
6. Radiation panel from NASA DONKI space-weather events (cached for offline use).
7. Environment log (CO₂ ppm, cabin °C, humidity %) recorded alongside health data.
Stretch, in this order: interactive body map (tap part → log symptom), reminders, streak/gamification, multi-crew view.

## How to work with the user
- **Rely heavily on web search.** Verify facts, thresholds, library APIs and versions against primary sources (guidelines, papers, official docs) before using them; cite what you used. If a page blocks fetching, use Claude in Chrome.
- **Don't just agree.** When the user's request is wrong, risky or there is a better approach, say so plainly, explain why with evidence, and propose the better option before (or while) building.

## Hard rules
- **Offline by design.** No feature may require the internet at runtime. No cloud LLM calls. DONKI is fetched when online and served from disk cache otherwise.
- **No ML training.** Rules + statistics only. Do not add model training code.
- **Never invent a medical threshold.** Every rule in `backend/rules/thresholds.json` has `source_title` and `source_url`. If a value is unknown, add it with `"value": null, "todo": "look up in NASA-STD-3001"` and skip it in the UI. Never guess.
- **Wording:** "monitoring", "check", "consider", "contact flight surgeons". Never "diagnose", "you have", "treatment".
- **Heart rate only from the camera.** HRV and stress from rPPG are NOT credible yet — do not compute or display them.
- **Low signal quality → ask for a re-scan, don't show a number.**
- **Simulated data is always labelled** `source="simulated"` and shown with a "Simulated" badge.
- No NASA logos or branding in generated assets. No secrets in the repo (`.env` is gitignored; never copy VitalSense's `src/.env`).

## Reused code (allowed by the Karachi Local Lead, must be attributed)
From VitalSense (github.com/Arhamurrahemeen/VitalSense, own prior open-source work, MIT):
`roi.py`, `lighting.py`, `dsp_pipeline.py` → `backend/rppg/`.
Each reused file starts with:
```
# Adapted from VitalSense (https://github.com/Arhamurrahemeen/VitalSense, commit <SHA>), MIT License,
# by Muhammad Arham. Prior open-source work reused with permission of the Karachi Local Lead.
```
Use the **POS** method. Signal invariants: FS=30, cardiac band 0.7–4.0 Hz, zero-phase SOS filtering, detrend before filter, fail-soft sentinel `(0, 0.0)`.
Known issue: in one informal test the old green-channel build read 15–25 BPM low at high confidence. POS is untested on real faces → `tools/validate.py` must measure MAE against the oximeter.

## Stack
- `backend/` — Python 3.11+, FastAPI, SQLite (stdlib `sqlite3`), OpenCV, MediaPipe, NumPy, SciPy, httpx.
- `frontend/` — React + Vite, Recharts for charts, plain CSS. No heavy UI frameworks.
- Runs locally: backend on `localhost:8000`, frontend on `localhost:5173`.
- `frontend` has a `VITE_DEMO_MODE=true` build that uses bundled simulated JSON and no backend (for the public hosted link).

## Layout
```
backend/
  main.py              FastAPI app, CORS for localhost:5173
  db.py                SQLite schema + helpers
  rppg/                reused VitalSense modules + checkin.py (30 s scan → bpm, quality_db)
  rules/thresholds.json  indicator ranges, each with source
  rules/engine.py      status (green/amber/red) + guidance text + escalation flag
  baseline/engine.py   rolling mean/SD, z-score, 7-day slope
  sim/generate.py      90-day crew history from published ranges (seeded, reproducible)
  donki/client.py      fetch SEP/FLR/CME/GST → cache/donki.json; offline fallback
  tests/               pytest
frontend/src/
  pages/ Dashboard, CheckIn, Log, Radiation, Environment, BodyMap
  components/ StatusCard, TrendChart, GuidancePanel, SourceLink, SimulatedBadge
tools/validate.py      camera vs oximeter pairs → MAE, bias, Bland–Altman PNG
```

## Data model (SQLite)
- `reading(id, crew_id, ts, indicator, value, unit, source, quality)` — source ∈ camera|manual|oximeter|simulated
- `symptom(id, crew_id, ts, body_part, severity_1_5, note)`
- `environment(id, ts, co2_ppm, temp_c, humidity_pct)`
- `radiation_event(id, ts, type, details_json, source)` — source = donki

## API (keep it small)
- `POST/GET /readings` · `POST /checkin` (camera) · `GET /status/{crew_id}` (latest per indicator + colour + guidance + baseline alert)
- `GET /trends/{crew_id}?indicator=&days=` · `POST/GET /environment` · `POST/GET /symptoms`
- `GET /radiation` (cached DONKI + estimated cumulative dose, labelled as estimate)

## Commands
- Backend: `cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && uvicorn main:app --reload`
- Frontend: `cd frontend && npm install && npm run dev`
- Tests: `cd backend && pytest -q`
- Simulated data: `python -m sim.generate --crew 4 --days 90 --seed 42`

## Definition of done (per feature)
Works with Wi-Fi off · has a test or a manual check note · no console errors · every number on screen shows its unit and, for thresholds, its source.

## Sources for thresholds (see vault note Research_Citations)
- BP: 2025 AHA/ACC guideline — https://doi.org/10.1161/CIR.0000000000001356
- Glucose: ADA Standards of Care 2026 — https://diabetesjournals.org/care/issue/49/Supplement_1
- Sleep <5 h risk: Jones et al., SLEEP 2022 — https://read.qxmd.com/read/35023565
- Cardiovascular changes: Krittanawong et al. 2023 — https://doi.org/10.1016/j.pcad.2023.07.009
- Bone loss ranges: Gabel et al. 2022 — https://doi.org/10.1038/s41598-022-13461-1
- Behavioural health: NASA OCHMO TB-016 — https://www.nasa.gov/ochmo/health-operations-and-oversight/hsa-standards/
- Spaceflight limits (SpO₂, temp, CO₂): NASA-STD-3001 — https://www.nasa.gov/reference/nasa-std-3001v1/  (values TODO — look up, don't guess)
- Radiation events: NASA CCMC DONKI — https://ccmc.gsfc.nasa.gov/tools/DONKI/
