# CrewPulse

Offline-first self-health monitor for astronauts — NASA Space Apps Challenge 2026 (Karachi), team OmniteX.

Decision support only, not a diagnostic tool.

## Run

Backend (localhost:8000):

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
curl -L -o rppg/models/face_landmarker.task --create-dirs "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
uvicorn main:app --reload
```

The face model (~3.7 MB) is gitignored; the camera check-in needs it.

Frontend (localhost:5173):

```
cd frontend
npm install
npm run dev
```

Tests: `cd backend && pytest -q`

## Status

Scaffold only. Features in progress.

## Credits

`backend/rppg/` will reuse modules from [VitalSense](https://github.com/Arhamurrahemeen/VitalSense) (MIT, Muhammad Arham), with permission of the Karachi Local Lead.
