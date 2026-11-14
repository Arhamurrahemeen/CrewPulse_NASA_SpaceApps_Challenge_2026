"""NASA CCMC DONKI space-weather events (SEP, FLR, CME, GST) with an offline disk cache.

Fetched when online, served from cache/donki.json otherwise (CLAUDE.md: offline by design).
Refresh before going offline:  python -m donki.client
"""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

# ccmc.gsfc.nasa.gov answers; kauai.ccmc.gsfc.nasa.gov did not connect when tested (2026-11-14), so it is the
# fallback rather than the first try (otherwise every fetch waits for its timeout).
BASES = ["https://ccmc.gsfc.nasa.gov/DONKI-API/get", "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get"]
TYPES = ("SEP", "FLR", "CME", "GST")
WINDOW_DAYS = 30
CACHE_PATH = Path(__file__).resolve().parent.parent / "cache" / "donki.json"
TIMEOUT = httpx.Timeout(20.0, connect=5.0)
CREDIT = {
    "text": "Space weather data: NASA Community Coordinated Modeling Center (CCMC), "
            "Space Weather Database Of Notifications, Knowledge, Information (DONKI)",
    "url": "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
}


def _max_kp(e):
    kps = [k.get("kpIndex") for k in e.get("allKpIndex") or [] if k.get("kpIndex") is not None]
    return max(kps) if kps else None


def _cme_speed(e):
    for a in e.get("cmeAnalyses") or []:
        if a.get("isMostAccurate") and a.get("speed"):
            return a["speed"]
    return None


def normalize(kind, e):
    """Keep only what the timeline shows (the raw CME payload is ~150 kB a month)."""
    if kind == "FLR":
        detail = f"Solar flare, class {e.get('classType') or '?'}" + (f", {e['sourceLocation']}" if e.get("sourceLocation") else "")
        return {"id": e.get("flrID"), "type": kind, "time": e.get("peakTime") or e.get("beginTime"), "detail": detail, "link": e.get("link")}
    if kind == "CME":
        speed = _cme_speed(e)
        detail = "Coronal mass ejection" + (f", ~{speed:.0f} km/s" if speed else "")
        return {"id": e.get("activityID"), "type": kind, "time": e.get("startTime"), "detail": detail, "link": e.get("link")}
    if kind == "GST":
        kp = _max_kp(e)
        detail = "Geomagnetic storm" + (f", max Kp {kp:g}" if kp is not None else "")
        return {"id": e.get("gstID"), "type": kind, "time": e.get("startTime"), "detail": detail, "link": e.get("link")}
    return {"id": e.get("sepID"), "type": kind, "time": e.get("eventTime"), "detail": "Solar energetic particle event",
            "link": e.get("link")}


def fetch_all(days=WINDOW_DAYS, client=None, now=None):
    """Fetch every type from the first base that answers. Raises httpx.HTTPError if a type fails on all bases."""
    now = now or datetime.now(timezone.utc)
    start, end = (now - timedelta(days=days)).date().isoformat(), now.date().isoformat()
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT)
    events, used = [], None
    try:
        for kind in TYPES:
            last_err = None
            for base in ([used] if used else []) + [b for b in BASES if b != used]:
                try:
                    r = client.get(f"{base}/{kind}", params={"startDate": start, "endDate": end})
                    r.raise_for_status()
                    data = r.json() if r.content.strip() else []  # DONKI may answer with an empty body
                    events += [normalize(kind, e) for e in data or []]
                    used = base
                    break
                except (httpx.HTTPError, ValueError) as e:
                    last_err = e
            else:
                raise httpx.HTTPError(f"DONKI {kind} unavailable: {last_err}")
    finally:
        if own:
            client.close()
    events.sort(key=lambda e: e["time"] or "", reverse=True)
    return {"fetched_at": now.isoformat(), "start": start, "end": end, "api": used, "events": events}


def save(data, path=None):
    path = Path(path or CACHE_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    os.replace(tmp, path)  # atomic: a failed write never leaves a half cache


def load(path=None):
    path = Path(path or CACHE_PATH)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def refresh(**kw):
    """Fetch and cache. On any network failure the existing cache is left untouched and the error re-raised."""
    data = fetch_all(**kw)
    save(data)
    return data


if __name__ == "__main__":
    d = refresh()
    print(f"Cached {len(d['events'])} DONKI events ({d['start']}..{d['end']}) from {d['api']} -> {CACHE_PATH}")


# --- Estimated dose (an ESTIMATE from published averages, not a measurement) ---
# NASA, "Space Faring: The Radiation Challenge" (educator guide, Module 1): ISS crews receive an average of
# 80 mSv for a six-month stay at solar maximum and 160 mSv at solar minimum.
ISS_DOSE_6MO_MSV = (80, 160)
SIX_MONTHS_DAYS = 182.5
DOSE_SOURCE = {"title": "NASA, Space Faring: The Radiation Challenge (Module 1)",
               "url": "https://www.nasa.gov/wp-content/uploads/2017/04/radiationchallenge.pdf"}
# NASA-STD-3001 Vol 1 Rev C, [V1 4030]: career effective dose from spaceflight shall be less than 600 mSv.
CAREER_LIMIT_MSV = 600
LIMIT_SOURCE = {"title": "NASA-STD-3001 Vol 1 Rev C, [V1 4030] career limit",
                "url": "https://www.nasa.gov/reference/nasa-std-3001v1/"}


def estimate_dose(mission_days):
    lo, hi = (round(d / SIX_MONTHS_DAYS * mission_days, 1) for d in ISS_DOSE_6MO_MSV)
    return {
        "is_estimate": True, "mission_days": mission_days, "low_msv": lo, "high_msv": hi,
        "per_day_msv": [round(d / SIX_MONTHS_DAYS, 2) for d in ISS_DOSE_6MO_MSV],
        "career_limit_msv": CAREER_LIMIT_MSV,
        "pct_of_limit": [round(lo / CAREER_LIMIT_MSV * 100, 1), round(hi / CAREER_LIMIT_MSV * 100, 1)],
        "basis": "Mission days x ISS average (80 mSv per 6 months at solar maximum to 160 mSv at solar minimum). "
                 "Not a dosimeter reading; solar particle events (SEP) can add dose that this does not include.",
        "source": DOSE_SOURCE, "limit_source": LIMIT_SOURCE,
    }
