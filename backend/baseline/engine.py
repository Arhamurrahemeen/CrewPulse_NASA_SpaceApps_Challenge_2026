"""Personal baseline per indicator: rolling mean ± 2 SD, z-score, 7-day trend slope.

Statistical heuristics, not medical thresholds:
- Readings are averaged per UTC day first (the ISS keeps GMT), so busy days don't dominate.
- Baseline = daily means of the WINDOW_DAYS days before yesterday, EXCLUDING today and yesterday (the
  days being judged must not inflate the SD meant to catch them). Needs MIN_DAYS days of history.
- unusual: today AND yesterday both beyond Z_ALERT SD, in the same direction (2-consecutive-day rule).
  Under independence that is ~1 false flag per ~970 checks per indicator, vs ~1 per 22 for a single
  day at 2 SD; real day-to-day correlation makes it somewhat more frequent.
- trend: least-squares slope over the last TREND_DAYS daily means; flagged when p < 0.05 AND the
  projected 7-day change is at least one baseline SD.
"""

from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np
from scipy import stats

WINDOW_DAYS = 28
MIN_DAYS = 7
Z_ALERT = 2.0
TREND_DAYS = 7
TREND_MIN_POINTS = 4


def daily_means(readings):
    """[(iso_ts, value)] -> sorted [(date, mean)] by UTC day."""
    days = defaultdict(list)
    for ts, v in readings:
        days[datetime.fromisoformat(ts).date()].append(v)
    return sorted((d, float(np.mean(vs))) for d, vs in days.items())


def baseline(readings, unit=""):
    """Compare the latest day with the personal baseline. readings: [(iso_ts, value)] of one indicator.
    `reasons` holds plain-English explanations for the "Unusual for you" badge (empty when nothing is flagged)."""
    days = daily_means(readings)
    if not days:
        return None
    latest_day, latest = days[-1]
    yesterday = next((v for d, v in days if d == latest_day - timedelta(days=1)), None)
    history = [v for d, v in days if 2 <= (latest_day - d).days <= WINDOW_DAYS + 1]
    out = {"window_days": WINDOW_DAYS, "n_days": len(history), "min_days": MIN_DAYS, "ready": len(history) >= MIN_DAYS,
           "mean": None, "sd": None, "z": None, "z_prev": None, "unusual": False,
           "slope_per_day": None, "slope_p": None, "trend": False, "reasons": []}
    if not out["ready"]:
        return out

    mean, sd = float(np.mean(history)), float(np.std(history, ddof=1))
    out.update(mean=round(mean, 2), sd=round(sd, 2))
    if sd > 0:
        z = (latest - mean) / sd
        out["z"] = round(z, 2)
        if yesterday is not None:
            z_prev = (yesterday - mean) / sd
            out["z_prev"] = round(z_prev, 2)
            out["unusual"] = bool(min(abs(z), abs(z_prev)) >= Z_ALERT and np.sign(z) == np.sign(z_prev))

    recent = [(d, v) for d, v in days if (latest_day - d).days < TREND_DAYS]
    if len(recent) >= TREND_MIN_POINTS:
        x = [(d - latest_day).days for d, _ in recent]
        fit = stats.linregress(x, [v for _, v in recent])
        if np.isfinite(fit.pvalue):
            out.update(slope_per_day=round(float(fit.slope), 3), slope_p=round(float(fit.pvalue), 4),
                       trend=bool(fit.pvalue < 0.05 and sd > 0 and abs(fit.slope) * TREND_DAYS >= sd))

    if out["unusual"]:
        side = "Above" if out["z"] > 0 else "Below"
        out["reasons"].append(f"{side} your usual range two days in a row "
                              f"(yesterday z {out['z_prev']:+.1f}, today z {out['z']:+.1f}; usual {mean:.1f} ± {sd:.1f} {unit})".replace(" )", ")"))
    if out["trend"]:
        word = "rise" if out["slope_per_day"] > 0 else "fall"
        out["reasons"].append(f"Steady {word} over the last {TREND_DAYS} days ({out['slope_per_day']:+.2f} {unit}/day)")
    return out
