"""Every band edge in thresholds.json, written out by hand from the cited sources (so a typo in the JSON fails)."""

import json

import pytest

from rules.engine import INDICATORS, check_value, evaluate

# (indicator, value, status, band-label prefix, escalate_to_flight_surgeon)
BOUNDARIES = [
    # AHA: normal resting HR 60-100 bpm
    ("heart_rate", 59, "amber", "Below 60", False),
    ("heart_rate", 60, "green", "60-100", False),
    ("heart_rate", 100, "green", "60-100", False),
    ("heart_rate", 101, "amber", "Above 100", False),
    # CDC: fever = measured 38 °C (100.4 °F) or greater
    ("body_temp", 37.9, "green", "Below 38", False),
    ("body_temp", 38, "red", "Fever", True),
    # 2025 AHA/ACC: normal <120 and <80; elevated 120-129; stage 1 130-139 or 80-89; stage 2 >=140 or >=90; severe >180 and/or >120
    ("bp_systolic", 119, "green", "Normal", False),
    ("bp_systolic", 120, "amber", "Elevated", False),
    ("bp_systolic", 129, "amber", "Elevated", False),
    ("bp_systolic", 130, "amber", "Stage 1", False),
    ("bp_systolic", 139, "amber", "Stage 1", False),
    ("bp_systolic", 140, "red", "Stage 2", False),
    ("bp_systolic", 180, "red", "Stage 2", False),
    ("bp_systolic", 181, "red", "Severe", True),
    ("bp_diastolic", 79, "green", "Normal", False),
    ("bp_diastolic", 80, "amber", "Stage 1", False),
    ("bp_diastolic", 89, "amber", "Stage 1", False),
    ("bp_diastolic", 90, "red", "Stage 2", False),
    ("bp_diastolic", 120, "red", "Stage 2", False),
    ("bp_diastolic", 121, "red", "Severe", True),
    # ADA 2026: level 2 <54; level 1 54-69; FPG 100-125 IFG; >=126 diabetes criterion
    ("glucose_fasting", 53.9, "red", "Level 2", True),
    ("glucose_fasting", 54, "amber", "Level 1", False),
    ("glucose_fasting", 69.9, "amber", "Level 1", False),
    ("glucose_fasting", 70, "green", "70-99", False),
    ("glucose_fasting", 99.9, "green", "70-99", False),
    ("glucose_fasting", 100, "amber", "100-125", False),
    ("glucose_fasting", 125.9, "amber", "100-125", False),
    ("glucose_fasting", 126, "red", "126+", True),
    # Jones et al. SLEEP 2022: <6 h slower psychomotor response; <5 h worse somatic state
    ("sleep_hours", 4.99, "red", "Under 5", False),
    ("sleep_hours", 5, "amber", "5-6", False),
    ("sleep_hours", 5.99, "amber", "5-6", False),
    ("sleep_hours", 6, "green", "6 h", False),
]


@pytest.mark.parametrize("ind,value,status,label,escalate", BOUNDARIES)
def test_boundary(ind, value, status, label, escalate):
    r = evaluate(ind, value)
    assert (r["status"], r["escalate_to_flight_surgeon"]) == (status, escalate)
    assert r["band"].startswith(label)
    assert r["guidance"] and r["source_url"]


def test_every_band_edge_is_covered():
    """Each 'below' edge b must appear in BOUNDARIES as b itself (first value of the next band)."""
    tested = {(i, v) for i, v, *_ in BOUNDARIES}
    for ind, spec in INDICATORS.items():
        for band in spec.get("bands", []):
            if "below" in band:
                assert (ind, band["below"]) in tested, f"{ind} edge {band['below']} has no test"


@pytest.mark.parametrize("ind", ["spo2", "mood", "stress", "hrv_rmssd"])
def test_uncited_indicators_have_no_colour(ind):
    spec = INDICATORS[ind]
    assert spec["value"] is None and spec["todo"] and "bands" not in spec
    r = evaluate(ind, spec["limits"][0])
    assert r["status"] is None and not r["escalate_to_flight_surgeon"] and r["source_url"] is None


def test_only_claude_md_sources():
    allowed = {
        "https://doi.org/10.1161/CIR.0000000000001356",  # 2025 AHA/ACC BP
        "https://diabetesjournals.org/care/issue/49/Supplement_1",  # ADA 2026
        "https://doi.org/10.1093/sleep/zsac006",  # Jones et al. SLEEP 2022 (PMID 35023565)
        "https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse",
        "https://www.cdc.gov/quarantine/maritime/definitions-signs-symptoms-conditions-ill-travelers.html",
    }
    for spec in INDICATORS.values():
        if "bands" in spec:
            assert spec["source_url"] in allowed and spec["source_title"]


def test_every_band_has_required_fields():
    for spec in INDICATORS.values():
        for band in spec.get("bands", []):
            assert band["status"] in ("green", "amber", "red")
            assert isinstance(band["escalate_to_flight_surgeon"], bool) and band["guidance"]


def test_wording_rules():
    text = json.dumps(INDICATORS).lower()
    for banned in ("diagnos", "you have", "treatment"):
        assert banned not in text


@pytest.mark.parametrize("ind", list(INDICATORS))
def test_input_limits(ind):
    lo, hi = INDICATORS[ind]["limits"]
    check_value(ind, lo)
    check_value(ind, hi)
    for bad in (lo - 1, hi + 1):
        with pytest.raises(ValueError):
            check_value(ind, bad)
