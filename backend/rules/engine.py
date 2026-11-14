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
    """-> {status, band, guidance, escalate_to_flight_surgeon, source_title, source_url}.
    status is None when the indicator has no cited threshold (value: null + todo)."""
    spec = INDICATORS[indicator]
    for band in spec.get("bands", []):
        if "below" not in band or value < band["below"]:
            return {
                "status": band["status"],
                "band": band["label"],
                "guidance": band["guidance"],
                "escalate_to_flight_surgeon": band["escalate_to_flight_surgeon"],
                "source_title": spec["source_title"],
                "source_url": spec["source_url"],
            }
    return {"status": None, "band": "No cited threshold yet", "guidance": None,
            "escalate_to_flight_surgeon": False, "source_title": None, "source_url": None}


def bands(indicator):
    """Cited bands as [{from, to, status}] ranges for charts; open ends stop at the plausible input limits."""
    spec = INDICATORS[indicator]
    lo, hi = spec["limits"]
    out, start = [], lo
    for band in spec.get("bands", []):
        end = band.get("below", hi)
        out.append({"from": start, "to": end, "status": band["status"], "label": band["label"]})
        start = end
    return out
