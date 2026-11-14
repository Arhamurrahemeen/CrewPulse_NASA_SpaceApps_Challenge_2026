"""Personal baseline per indicator: rolling mean ± 2 SD, z-score, 7-day trend slope.

Statistical heuristics, not medical thresholds:
- Readings are averaged per UTC day first (the ISS keeps GMT), so busy days don't dominate.
- Baseline = daily means of the previous WINDOW_DAYS days, EXCLUDING the latest day (an outlier
  must not inflate the SD meant to catch it). Needs MIN_DAYS days before anything is flagged.
- unusual: |z| >= Z_ALERT. Under normality that is ~1 false flag per 22 checks per indicator.
- trend: least-squares slope over the last TREND_DAYS daily means; flagged when p < 0.05 AND the
  projected 7-day change is at least one baseline SD.
"""

from collections import defaultdict
from datetime import datetime

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


def baseline(readings):
    """Compare the latest day with the personal baseline. readings: [(iso_ts, value)] of one indicator."""
    days = daily_means(readings)
    if not days:
        return None
    latest_day, latest = days[-1]
    history = [v for d, v in days[:-1] if (latest_day - d).days <= WINDOW_DAYS]
    out = {"window_days": WINDOW_DAYS, "n_days": len(history), "min_days": MIN_DAYS, "ready": len(history) >= MIN_DAYS,
           "mean": None, "sd": None, "z": None, "unusual": False,
           "slope_per_day": None, "slope_p": None, "trend": False}
    if not out["ready"]:
        return out

    mean, sd = float(np.mean(history)), float(np.std(history, ddof=1))
    out.update(mean=round(mean, 2), sd=round(sd, 2))
    if sd > 0:
        z = (latest - mean) / sd
        out.update(z=round(z, 2), unusual=bool(abs(z) >= Z_ALERT))

    recent = [(d, v) for d, v in days if (latest_day - d).days < TREND_DAYS]
    if len(recent) >= TREND_MIN_POINTS:
        x = [(d - latest_day).days for d, _ in recent]
        fit = stats.linregress(x, [v for _, v in recent])
        if np.isfinite(fit.pvalue):
            out.update(slope_per_day=round(float(fit.slope), 3), slope_p=round(float(fit.pvalue), 4),
                       trend=bool(fit.pvalue < 0.05 and sd > 0 and abs(fit.slope) * TREND_DAYS >= sd))
    return out
