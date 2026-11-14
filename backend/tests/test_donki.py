import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from donki import client as donki

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
REAL_FETCH = donki.fetch_all  # tests monkeypatch donki.fetch_all; keep the real one
SAMPLE = {
    "FLR": [{"flrID": "F1", "peakTime": "2026-11-01T10:00Z", "classType": "M1.3", "sourceLocation": "S16W15", "link": "https://x/F1"}],
    "CME": [{"activityID": "C1", "startTime": "2026-11-03T00:00Z", "link": "https://x/C1",
             "cmeAnalyses": [{"isMostAccurate": False, "speed": 300}, {"isMostAccurate": True, "speed": 812.4}]}],
    "GST": [{"gstID": "G1", "startTime": "2026-10-31T18:00Z", "link": "https://x/G1",
             "allKpIndex": [{"kpIndex": 5.33}, {"kpIndex": 6.0}]}],
    "SEP": [],
}


def transport(dead=()):
    """Mock DONKI: bases in `dead` fail to connect; others answer with SAMPLE (SEP as an empty body)."""
    calls = []

    def handler(req):
        calls.append(str(req.url))
        if any(str(req.url).startswith(b) for b in dead):
            raise httpx.ConnectError("down", request=req)
        kind = req.url.path.rsplit("/", 1)[-1]
        assert req.url.params["startDate"] == "2026-10-15" and req.url.params["endDate"] == "2026-11-14"
        return httpx.Response(200, content=b"" if kind == "SEP" else json.dumps(SAMPLE[kind]).encode())

    return httpx.MockTransport(handler), calls


def test_fetch_normalizes_and_sorts():
    t, calls = transport()
    d = donki.fetch_all(client=httpx.Client(transport=t), now=NOW)
    assert d["api"] == donki.BASES[0] and len(calls) == 4
    assert [e["id"] for e in d["events"]] == ["C1", "F1", "G1"]  # newest first
    detail = {e["id"]: e["detail"] for e in d["events"]}
    assert detail == {"F1": "Solar flare, class M1.3, S16W15", "C1": "Coronal mass ejection, ~812 km/s",
                      "G1": "Geomagnetic storm, max Kp 6"}


def test_fallback_to_second_base():
    t, calls = transport(dead=(donki.BASES[0],))
    d = donki.fetch_all(client=httpx.Client(transport=t), now=NOW)
    assert d["api"] == donki.BASES[1] and len(d["events"]) == 3


def test_all_down_raises():
    t, _ = transport(dead=tuple(donki.BASES))
    with pytest.raises(httpx.HTTPError):
        donki.fetch_all(client=httpx.Client(transport=t), now=NOW)


def test_dose_estimate():
    d = donki.estimate_dose(182)
    assert d["is_estimate"] and (d["low_msv"], d["high_msv"]) == (79.8, 159.6)
    assert d["career_limit_msv"] == 600 and d["pct_of_limit"] == [13.3, 26.6]
    assert "SEP" in d["basis"] and d["source"]["url"].startswith("https://www.nasa.gov/")


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(donki, "CACHE_PATH", tmp_path / "cache" / "donki.json")
    monkeypatch.setattr(main, "_donki_retry_after", None)
    return TestClient(main.app)


def offline(*_, **__):
    raise httpx.ConnectError("no network")


def test_radiation_offline_without_cache(api, monkeypatch):
    monkeypatch.setattr(donki, "fetch_all", offline)
    r = api.get("/radiation")
    assert r.status_code == 503 and "Connect once" in r.json()["detail"]


def test_radiation_online_then_offline(api, monkeypatch):
    t, _ = transport()
    monkeypatch.setattr(donki, "fetch_all", lambda **kw: REAL_FETCH(client=httpx.Client(transport=t), now=NOW))
    r = api.get("/radiation", params={"mission_days": 90}).json()
    assert not r["offline"] and r["age_hours"] == 0 and r["counts"] == {"SEP": 0, "FLR": 1, "CME": 1, "GST": 1}
    assert r["dose"]["mission_days"] == 90 and r["credit"]["url"] == "https://ccmc.gsfc.nasa.gov/tools/DONKI/"

    cached = donki.load()  # age the cache by 30 h, then lose the network
    cached["fetched_at"] = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
    donki.save(cached)
    monkeypatch.setattr(donki, "fetch_all", offline)
    r = api.get("/radiation").json()
    assert r["offline"] and 29.9 <= r["age_hours"] <= 30.1 and len(r["events"]) == 3


def test_fresh_cache_not_refetched(api, monkeypatch):
    donki.save({"fetched_at": datetime.now(timezone.utc).isoformat(), "start": "a", "end": "b", "api": "x", "events": []})
    monkeypatch.setattr(donki, "fetch_all", lambda **kw: pytest.fail("should use the fresh cache"))
    assert api.get("/radiation").json()["offline"] is False



def test_offline_backoff(api, monkeypatch):
    """After a failed fetch, stale-cache requests skip the network for a while; an explicit refresh still tries."""
    donki.save({"fetched_at": (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat(), "start": "a", "end": "b",
                "api": "x", "events": []})
    calls = []
    monkeypatch.setattr(donki, "fetch_all", lambda **kw: calls.append(1) or offline())
    assert api.get("/radiation").json()["offline"] and api.get("/radiation").json()["offline"]
    assert len(calls) == 1
    api.get("/radiation", params={"refresh": True})
    assert len(calls) == 2
