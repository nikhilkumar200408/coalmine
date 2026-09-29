"""Read-side views: node views, sensor health, digital twin, network, analytics, system health."""
import time, statistics
from . import config as C, mine as M
from .engine import SENSORS, clip

def _std(dq):
    return statistics.pstdev(dq) if len(dq) >= 3 else 0.0

def sensor_health(n, now):
    out = []
    offline = getattr(n, "offline", True)
    for name, chs in SENSORS.items():
        seen = [n.lastt[c] for c in chs if c in n.lastt]
        d = {"sensor": name, "connected": bool(seen), "last_valid_age": None, "hz": None, "quality": None, "detail": {}}
        if not seen:
            d["status"] = "NOT CONNECTED"
            out.append(d); continue
        age = time.time() - n.last_seen if n.last_seen else None
        d["last_valid_age"] = round(now - max(seen), 1)
        cnt = n.cnt[chs[0]]
        if len(cnt) >= 2 and cnt[-1] > cnt[0]:
            d["hz"] = round((len(cnt) - 1) / (cnt[-1] - cnt[0]), 2)
        q, det = 100.0, {}
        if name == "MPU6050":
            std = max(_std(n.recent["pitch"]), _std(n.recent["roll"])); q = 100 - clip(std / 3) * 100
            drift = max(abs(n.base[c]["v"] - n.base[c]["v0"]) for c in ("pitch", "roll") if c in n.base) if "pitch" in n.base else 0
            det = {"pitch": n.v["pitch"], "roll": n.v["roll"], "noise_deg": round(std, 2), "drift_deg": round(drift, 2)}
        elif name == "Flex/Strain":
            std = _std(n.recent["strain_dev"]); q = 100 - clip(std / 6) * 100
            det = {"current": n.v["strain_dev"], "baseline": 0.0, "noise": round(std, 2)}
        elif name == "Sound/Vibration":
            b = n.base.get("vibration", {}).get("v"); det = {"current": n.v["vibration"], "baseline": round(b, 1) if b is not None else None}
        elif name == "Temperature": det = {"current": n.v["temperature"]}
        elif name == "Humidity": det = {"current": n.v["humidity"]}
        else: det = {"percent": n.v["battery_pct"], "voltage": "not reported", "sensing_valid": n.v["battery_pct"] is not None}
        d["quality"], d["detail"] = round(q), det
        stale = d["last_valid_age"] is not None and d["last_valid_age"] > C.SENSOR_FAIL_S
        d["status"] = "FAILED" if (stale and not offline) else ("UNKNOWN (node offline)" if offline else ("DEGRADED" if q < 60 else "HEALTHY"))
        out.append(d)
    return out

def reliability(n, sh):
    delivery = n.recv / (n.recv + n.lost) if n.recv else 0
    conn = [s for s in sh if s["connected"]]
    ok = sum(1 for s in conn if s["status"] == "HEALTHY") / len(conn) if conn else 0
    b = n.v["battery_pct"]; batt = 0.8 if b is None else clip(b / 40)
    return round(100 * (0.3 * delivery + 0.25 * (n.online_s / max(n.total_s, 1)) + 0.25 * ok + 0.1 * batt + 0.1 * (0 if n.learning == "WARMUP" else 1)))

def node_view(p, n, now, ai=None):
    offline = getattr(n, "offline", True)
    live = n.source == "REAL" or p.demo["active"]
    age = round(time.time() - n.last_seen, 1) if n.last_seen else None
    if not live and n.source == "SIMULATION": status, slabel = "OFFLINE", "NOT STREAMING"
    elif offline: status, slabel = "OFFLINE", ("WAITING FOR TELEMETRY" if not n.last_seen else "OFFLINE")
    else: status = M and __import__("samadhaan.engine", fromlist=["STATUS_OF"]).STATUS_OF[n.level]; slabel = status
    sh = sensor_health(n, now)
    base = {c: {"value": round(b["v"], 2), "n": b["n"], "age_s": round(now - b["t0"])} for c, b in n.base.items()}
    tr = getattr(n, "last_transient", None)
    idx = max(max(abs(n.dev["pitch"]), abs(n.dev["roll"])) / C.TILT_FULL_DEG, abs(n.dev["strain"]) / C.STRAIN_FULL_PCT)
    return {"id": n.id, "label": n.meta["label"], "source": n.source, "sector": n.meta["sector"], "gallery": n.meta["gallery"], "junction": n.meta["junction"],
            "x": n.meta["x"], "y": n.meta["y"], "lat": n.meta["lat"], "lng": n.meta["lng"], "depth_m": n.meta["depth_m"], "installed": n.meta["installed"], "nearby": n.meta.get("nearby", []),
            "firmware": n.fw, "uptime": n.uptime, "status": status, "status_label": slabel, "offline": offline, "level": n.level if not offline else "UNKNOWN", "risk": n.risk,
            "confidence": n.conf, "confidence_why": getattr(n, "conf_why", []), "decision": n.decision if not offline else slabel, "corroborating": n.corr,
            "values": {"pitch": n.v["pitch"], "roll": n.v["roll"], "pitch_dev": round(n.dev["pitch"], 2), "roll_dev": round(n.dev["roll"], 2),
                       "strain_dev": n.v["strain_dev"], "vibration": n.v["vibration"], "temperature": n.v["temperature"], "humidity": n.v["humidity"], "battery_pct": n.v["battery_pct"]},
            "quality": dict(n.qual), "rssi": n.rssi, "link": n.link, "power": n.power, "last_seen_age": age,
            "contributions": n.contrib, "notes": n.notes, "trend_idx_per_min": round(n.trend, 3), "persistence_s": round(n.persist), "deform_idx": round(clip(idx, 0, 1.5), 3),
            "baseline": base, "learning": n.learning, "freeze_reason": n.freeze_reason, "calibration": n.calib, "alpha": C.BASELINE_ALPHA,
            "transient": ({**n.transient, "state": "ACTIVE", "classification": "LIKELY TRANSIENT DISTURBANCE", "tilt": "NORMAL", "strain": "NORMAL"} if n.transient else tr),
            "sensor_health": sh, "reliability": reliability(n, sh), "packets": {"received": n.recv, "lost": n.lost},
            "events": list(n.events)[-8:], "ai": ai, "estimated": ["risk", "confidence", "deform_idx", "trend"]}

def build_state(p, ai_fn=None):
    now = time.time()
    views = []
    for n in p.nodes.values():
        views.append(node_view(p, n, now, ai_fn(n) if ai_fn else None))
    sl = p.sector_levels()
    sectors = []
    for s, meta in M.SECTORS.items():
        ns = [v for v in views if v["sector"] == s]
        sectors.append({"id": s, "name": meta["name"], "rect": meta["rect"], "level": sl[s], "ventilation": p.vent[s], "workers": p.workers[s], "nodes": [v["id"] for v in ns],
                        "online": sum(1 for v in ns if not v["offline"]), "route": p.routes.get(s), "status_text": M.sector_status_text(sl[s])})
    active = [v for v in views if not v["offline"]]
    inc_all = sorted(p.incidents.values(), key=lambda i: -i["ts"])
    open_inc = [i for i in inc_all if i["status"] != "RESOLVED"]
    worst = max([M.RANK.get(v["level"], 0) for v in active], default=0)
    worst_name = ["SAFE", "CAUTION", "HIGH", "CRITICAL"][worst] if active else "UNKNOWN"
    real = p.nodes["NODE-01"]
    return {"ts": now, "demo": dict(p.demo), "mine": {**M.MINE, "sectors": sectors and {s["id"]: s["rect"] for s in sectors}},
            "kpis": {"nodes_total": len(views), "online": len(active), "offline": len(views) - len(active),
                     "degraded": sum(1 for v in active if v["level"] == "UNKNOWN" or v["confidence"] < 60),
                     "critical": sum(1 for v in active if v["level"] in ("HIGH", "CRITICAL")), "risk": worst_name,
                     "workers": sum(p.workers.values()), "workers_source": "SIMULATION (configured for this platform)", "incidents_open": len(open_inc),
                     "critical_alerts": sum(1 for i in open_inc if i["severity"] == "CRITICAL")},
            "real_node": {"connected": not getattr(real, "offline", True), "link": real.link, "age": round(now - real.last_seen, 1) if real.last_seen else None},
            "nodes": views, "sectors": sectors, "incidents": inc_all[:60], "alerts": alerts(p, sl, open_inc), "routes": p.routes,
            "pipeline": pipeline(p, active), "sync": p.sync, "scenario": p.scenario.public(p.scenario.cur) if p.scenario else None,
            "thresholds": {"levels": C.LEVELS, "note": C.THRESHOLD_NOTE, "weights": C.WEIGHTS},
            "vent_note": "Ventilation values are MODELLED / SIMULATED \u2014 the ESP32 node does not measure airflow.",
            "twin": twin(p, views, "node", "current")}

def pipeline(p, active):
    if p.pipeline_offline: return "Offline"
    if p.sync["state"] == "SYNCING": return "Recovering"
    if not active: return "Offline"
    if p.store.fail or any(v.get("offline") for v in [] ): return "Degraded"
    return "Healthy"

def alerts(p, sl, open_inc):
    out = []
    for i in open_inc:
        key = f"ALR-{i['id']}"
        out.append({"id": key, "severity": i["severity"], "location": f"{i['sector']} / {i['node_id']}", "time": i["ts"], "reason": "; ".join(i["evidence"][:2]) or "risk threshold crossed",
                    "action": "Field verification required; engineer confirmation required before evacuation", "acknowledged": key in p.acked_alerts, "source": i["source"]})
    for s, lv in sl.items():
        if lv == "CAUTION":
            key = f"ALR-SEC-{s}-CAUTION"
            out.append({"id": key, "severity": "CAUTION", "location": M.SECTORS[s]["name"], "time": time.time(), "reason": "Elevated deformation trend detected", "action": "Increase monitoring",
                        "acknowledged": key in p.acked_alerts, "source": "derived"})
    return out

def twin(p, views, layer="node", window="current"):
    span = {"current": 0, "1h": 3600, "6h": 21600, "24h": 86400}.get(window, 0)
    now = time.time(); pts, prof = [], []
    for v in views:
        n = p.nodes[v["id"]]
        if v["offline"] and window == "current":
            continue
        if span:
            hs = [h for h in n.hist if now - h["ts"] <= span]
            risk = max([h["risk"] or 0 for h in hs], default=0)
            dfm = max([max(abs(h["pitch_dev"] or 0) / C.TILT_FULL_DEG, abs(h["strain_dev"] or 0) / C.STRAIN_FULL_PCT) for h in hs], default=0)
        else:
            risk, dfm = v["risk"], v["deform_idx"]
        if layer == "surface": val = dfm * 100
        elif layer == "exposure": val = risk * p.workers[v["sector"]] / max(1, max(p.workers.values()))
        elif layer == "anomaly": val = min(100, 20 * sum(1 for e in n.events if not span or now - e["ts"] <= span))
        else: val = risk
        pts.append((v["x"], v["y"], val)); prof.append((v["x"], dfm))
    surface = []
    for x in range(0, 601, 20):
        d = max([dv * pow(2.718, -((x - px) ** 2) / (2 * 90 ** 2)) for px, dv in prof], default=0)
        surface.append([x, round(d, 3)])
    return {"layer": layer, "window": window, "heat": M.heat_grid(pts), "surface_profile": surface,
            "note": "Heatmap/profile is an ESTIMATED visualisation derived from node deformation index and risk \u2014 not surveyed subsidence.",
            "galleries": [{"id": g, "a": M.J[a], "b": M.J[b], "sector": s, "level": p.sector_levels()[s], "vent": p.vent[s]} for g, (a, b, s) in M.G.items()],
            "junctions": {k: list(v) for k, v in M.J.items()}, "exits": M.EXITS, "vent_fan": M.VENT["fan"]["junction"]}

def network(p):
    links = []
    for n in p.nodes.values():
        off = getattr(n, "offline", True)
        st = "down" if off else ("weak" if (n.rssi is not None and n.rssi < -80) else "ok")
        links.append({"node": n.id, "type": n.link or ("SIM-MESH" if n.source == "SIMULATION" else "none"), "rssi": n.rssi, "status": st, "source": n.source,
                      "loss_pct": round(100 * n.lost / max(1, n.recv + n.lost), 1), "last_seen_age": round(time.time() - n.last_seen, 1) if n.last_seen else None,
                      "transports": {k: round(time.time() - v, 1) for k, v in n.transports.items()}})
    return {"gateway": {"id": "GATEWAY", "label": "Local FastAPI gateway"}, "links": links, "bridge": p.bridge, "sync": p.sync, "duplicates_dropped": p.dup,
            "offline_mode": p.pipeline_offline, "note": "LoRa is not configured \u2014 no LoRa telemetry has been received. Simulated links are labelled SIM-MESH."}

def analytics(p, rng="1H"):
    secs = {"1H": 3600, "6H": 21600, "24H": 86400, "7D": 604800}.get(rng, 3600); now = time.time()
    series = [{"ts": t, "risk": r, "nodes": k} for t, r, k in p.risk_hist if now - t <= secs]
    step = max(1, len(series) // 120); series = series[::step]
    dist = {}
    for n in p.nodes.values():
        c = {"SAFE": 0, "CAUTION": 0, "HIGH": 0, "CRITICAL": 0}
        for h in n.hist:
            if now - h["ts"] <= secs: c[next((l for t_, l in C.LEVELS if (h["risk"] or 0) >= t_), "SAFE")] += 1
        dist[n.id] = c
    ack = [i["acknowledged_at"] - i["ts"] for i in p.incidents.values() if i["acknowledged_at"]]
    cats = ["STRUCTURAL ANOMALY", "TEMPORARY DISTURBANCE", "SENSOR FAULT", "COMMUNICATION ISSUE", "NORMAL"]
    lat = list(p.latencies)
    return {"range": rng, "retained_note": "Charts cover the history retained in memory/storage since backend start.",
            "risk_trend": series, "event_classes": {c: p.cls.get(c, 0) for c in cats}, "event_log": list(p.class_log)[-40:], "node_risk_distribution": dist,
            "sector_risk": p.sector_levels(), "false_alarms_rejected": p.cls.get("TEMPORARY DISTURBANCE", 0), "critical_events": p.cls.get("STRUCTURAL ANOMALY", 0),
            "avg_response_s": round(sum(ack) / len(ack), 1) if ack else None, "avg_latency_ms": round(sum(lat) / len(lat)) if lat else None,
            "node_reliability": {n.id: node_view(p, n, now)["reliability"] for n in p.nodes.values()},
            "sensor_uptime": {n.id: round(100 * n.online_s / max(n.total_s, 1)) for n in p.nodes.values()}}

def system_health(p, ws_clients, ai):
    now = time.time(); vs = [node_view(p, n, now) for n in p.nodes.values()]
    active = [v for v in vs if not v["offline"]]
    sens = [s["status"] for v in active for s in v["sensor_health"]]
    real = p.nodes["NODE-01"]
    lat = list(p.latencies); rssis = [v["rssi"] for v in active if v["rssi"] is not None]
    lat_ts = p.store.latest_ts()
    return {"backend": {"api": "ONLINE", "websocket_clients": ws_clients, "uptime_s": round(now - p.t0)},
            "storage": {"status": "OK" if not p.store.fail else "DEGRADED", "latest_record_age_s": round(now - lat_ts, 1) if lat_ts else None, "write_failures": p.store.fail, "engine": "SQLite (+ legacy CSV log)"},
            "nodes": {"online": len(active), "offline": len(vs) - len(active), "degraded": sum(1 for v in active if v["confidence"] < 60 or v["level"] == "UNKNOWN")},
            "network": {"packet_loss_pct": round(100 * real.lost / max(1, real.recv + real.lost), 1), "avg_rssi": round(sum(rssis) / len(rssis)) if rssis else None,
                        "latency_ms": round(sum(lat) / len(lat)) if lat else None, "bridge": p.bridge, "sync": p.sync},
            "sensors": {"healthy": sens.count("HEALTHY"), "degraded": sens.count("DEGRADED"), "failed": sens.count("FAILED"), "not_connected": sum(1 for v in vs for s in v["sensor_health"] if s["status"] == "NOT CONNECTED")},
            "power": {"real_node_power": real.power, "battery_pct": real.v["battery_pct"], "note": "Battery is N/A until a battery is wired to the ADC divider"},
            "ai": {**ai, "baseline": {n.id: n.learning for n in p.nodes.values()}}, "pipeline": pipeline(p, active), "ts": now}
