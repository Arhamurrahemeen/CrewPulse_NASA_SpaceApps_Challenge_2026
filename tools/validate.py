"""Camera (rPPG) vs oximeter heart-rate agreement: MAE, bias, Bland-Altman limits + PNG, quality-gate sweep.

Pairs come from the app database: each camera heart_rate reading is matched to the nearest unused
oximeter heart_rate reading of the same crew member within --window seconds.
Protocol: wear the oximeter DURING the 30 s scan, then log its HR on the Log page with
"From oximeter" ticked right after the scan.

Usage (from repo root, backend venv active):
    python tools/validate.py --crew c1
"""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent

# Reference criterion: ±10 % or ±5 bpm, whichever is greater (IEC 60601-2-27 heart-rate accuracy, as quoted
# by device makers; the standard text itself is paywalled and was not checked).
def within_criterion(diff, ref):
    return np.abs(diff) <= np.maximum(5.0, 0.10 * ref)


def load(db_path, crew):
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)  # read-only: never touches app data
    rows = conn.execute(
        "SELECT ts, value, source, quality FROM reading WHERE crew_id = ? AND indicator = 'heart_rate' "
        "AND source IN ('camera', 'oximeter') ORDER BY ts", (crew,)).fetchall()
    conn.close()
    cam = [(datetime.fromisoformat(t), v, q) for t, v, s, q in rows if s == "camera"]
    oxi = [(datetime.fromisoformat(t), v) for t, v, s, q in rows if s == "oximeter"]
    return cam, oxi


def pair(cam, oxi, window_s):
    """Greedy nearest-in-time matching; each oximeter reading is used at most once.
    -> list of (camera_bpm, oximeter_bpm, quality_db)."""
    used, pairs = set(), []
    for t, bpm, q in cam:
        best = min(
            ((abs((t2 - t).total_seconds()), i) for i, (t2, _) in enumerate(oxi) if i not in used),
            default=None,
        )
        if best and best[0] <= window_s:
            used.add(best[1])
            pairs.append((bpm, oxi[best[1]][1], q))
    return pairs


def agreement(camera, ref):
    """Bland & Altman (Lancet 1986): bias = mean(camera - ref), limits = bias ± 1.96 SD."""
    camera, ref = np.asarray(camera, float), np.asarray(ref, float)
    d = camera - ref
    sd = float(np.std(d, ddof=1)) if len(d) > 1 else float("nan")
    bias = float(d.mean())
    return {
        "n": len(d),
        "mae": float(np.abs(d).mean()),
        "mape": float(np.mean(np.abs(d) / ref) * 100),
        "bias": bias,
        "sd": sd,
        "loa": (bias - 1.96 * sd, bias + 1.96 * sd),
        "within_criterion_pct": float(within_criterion(d, ref).mean() * 100),
    }


def gate_sweep(pairs):
    """For each candidate quality gate: how many scans survive and their MAE."""
    out = []
    for g in sorted({q for _, _, q in pairs if q is not None}):
        kept = [(c, r) for c, r, q in pairs if q is not None and q >= g]
        out.append((g, len(kept), float(np.mean([abs(c - r) for c, r in kept]))))
    return out


def plot(pairs, stats, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cam = np.array([p[0] for p in pairs], float)
    ref = np.array([p[1] for p in pairs], float)
    q = np.array([p[2] if p[2] is not None else np.nan for p in pairs], float)
    mean, diff = (cam + ref) / 2, cam - ref

    fig, ax = plt.subplots(figsize=(7, 4.5))
    sc = ax.scatter(mean, diff, c=q, cmap="viridis", edgecolors="k", linewidths=0.5)
    fig.colorbar(sc, ax=ax, label="camera signal quality (dB)")
    lo, hi = stats["loa"]
    ax.axhline(stats["bias"], color="k", label=f"bias {stats['bias']:+.1f} bpm")
    for y in (lo, hi):
        ax.axhline(y, color="k", linestyle="--")
    ax.plot([], [], "k--", label=f"95% limits {lo:+.1f} to {hi:+.1f} bpm")
    ax.set_xlabel("mean of camera and oximeter (bpm)")
    ax.set_ylabel("camera − oximeter (bpm)")
    ax.set_title(f"Bland–Altman: camera rPPG vs oximeter (n={stats['n']})")
    ax.grid(alpha=0.3)
    ax.legend(loc="best")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--crew", required=True)
    ap.add_argument("--db", default=ROOT / "backend" / "crewpulse.db", type=Path)
    ap.add_argument("--window", default=120, type=float, help="max seconds between paired readings (default 120)")
    ap.add_argument("--out", default=ROOT / "tools" / "bland_altman.png", type=Path)
    a = ap.parse_args(argv)

    if not a.db.exists():
        sys.exit(f"No database at {a.db}")
    cam, oxi = load(a.db, a.crew)
    pairs = pair(cam, oxi, a.window)
    print(f"crew {a.crew}: {len(cam)} camera, {len(oxi)} oximeter heart-rate readings -> {len(pairs)} pairs "
          f"(window {a.window:.0f} s)")
    if len(pairs) < 2:
        sys.exit("Need at least 2 pairs. Wear the oximeter during a check-in, then log its HR with 'From oximeter'.")

    s = agreement([p[0] for p in pairs], [p[1] for p in pairs])
    print(f"MAE   {s['mae']:.1f} bpm   MAPE {s['mape']:.1f} %")
    print(f"bias  {s['bias']:+.1f} bpm  (camera − oximeter; negative = camera reads low)")
    print(f"95% limits of agreement  {s['loa'][0]:+.1f} to {s['loa'][1]:+.1f} bpm  (SD {s['sd']:.1f})")
    print(f"within ±10% or ±5 bpm    {s['within_criterion_pct']:.0f} % of pairs")

    print("\nquality gate sweep (scans already stored had passed the 3 dB gate):")
    print("  gate dB   kept   MAE bpm")
    for g, n, mae in gate_sweep(pairs):
        print(f"  {g:7.1f}  {n:5d}   {mae:7.1f}")

    if s["n"] < 30:
        print(f"\nNote: {s['n']} pairs is a small sample; limits of agreement are imprecise. "
              "Aim for 30+ pairs across rest and post-exercise heart rates.")
    print("Note: the oximeter is the reference, not ground truth (its own pulse-rate error is typically a few bpm), "
          "and results apply only to the people, camera and lighting tested.")

    plot(pairs, s, a.out)
    print(f"\nBland–Altman plot -> {a.out}")


if __name__ == "__main__":
    main()
