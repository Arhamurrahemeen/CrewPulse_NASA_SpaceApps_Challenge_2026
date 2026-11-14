"""Status (green/amber/red), guidance text and escalation flag from cited bands in thresholds.json."""

import json
from pathlib import Path

INDICATORS = json.loads((Path(__file__).parent / "thresholds.json").read_text(encoding="utf-8"))["indicators"]


def check_value(indicator, value):
    """Raise ValueError if the value is outside the physically plausible input range."""
    spec = INDICATORS.get(indicator)
    if spec is None:
        raise ValueError(f"unknown indicator {indicator!r}")
    lo, hi = spec["limits"]
    if not lo <= value <= hi:
        raise ValueError(f"{spec['label']} must be {lo}-{hi} {spec['unit']}")
    if spec.get("integer") and value != int(value):
        raise ValueError(f"{spec['label']} must be a whole number")


def evaluate(indicator, value):
    """-> {status, band, guidance, escalate, source_title, source_url}; status None when no cited threshold."""
    for band in INDICATORS[indicator].get("bands", []):
        if "below" not in band or value < band["below"]:
            return {
                "status": band["status"],
                "band": band["label"],
                "guidance": band["guidance"],
                "escalate": band.get("escalate", False),
                "source_title": band["source_title"],
                "source_url": band["source_url"],
            }
    return {"status": None, "band": "No cited threshold yet", "guidance": None, "escalate": False,
            "source_title": None, "source_url": None}
