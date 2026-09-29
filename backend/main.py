"""
SAMADHAAN v6 backend -- real telemetry + digital twin + decision support + simulation platform.

Both data paths converge on ONE pipeline (samadhaan/engine.py):
    REAL:        ESP32 -> (Wi-Fi HTTP | USB serial_bridge) -> POST /api/v1/telemetry/esp32 -> Platform.ingest(source=REAL)
    SIMULATION:  Scenario Lab -> synthetic telemetry                                    -> Platform.ingest(source=SIMULATION)
Every legacy v5 endpoint is preserved (same paths / shapes).

Run:  pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000
"""
import asyncio, csv, json, os, time, warnings
from datetime import datetime
from typing import Any, Dict, List, Optional

import joblib, numpy as np, pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

from samadhaan import config as C, mine as M, views
from samadhaan.engine import Platform
from samadhaan.scenario import DEMO_KEYS, PRESETS, ScenarioEngine
from samadhaan.store import Store

warnings.filterwarnings("ignore")
app = FastAPI(title="SAMADHAAN Mine Operations Intelligence Platform v6")
app.add_middleware(CORSMiddleware, allow_origins=C.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

CSV_PATH, EVAC_LOG_PATH, NODES_PATH = "sensor_log.csv", "evacuation_log.csv", "nodes.json"
PRETRAINED = "subsidence_isolation_forest.joblib"
MIN_ROWS, EVAC_THRESHOLD = 50, 85
CSV_COLS = ["timestamp", "node_id", "pitch", "roll", "pitch_dev", "roll_dev", "sound", "temp", "humidity", "alarm", "rssi",
            "power_source", "link_mode", "battery_pct", "battery_sensing_ok", "risk"]

store = Store(C.DB_PATH)
platform = Platform(store)
scen = ScenarioEngine(platform)

# ---------------- AI layer (IsolationForest is ONE evidence layer, never the sole source of truth) ----------------
model, model_meta = None, {"version": "none", "samples": 0, "last_trained": None, "source": "none", "status": "threshold-only"}
if os.path.exists(PRETRAINED):
    model = joblib.load(PRETRAINED)
    model_meta = {"version": "pretrained-v1", "samples": None, "last_trained": None, "source": "pretrained (synthetic dataset)", "status": "ACTIVE"}
rows: List[dict] = []          # legacy in-memory log (REAL readings only)
train_ok, last_train_n = 0, 0
if os.path.exists(CSV_PATH):
    try:
        for r in pd.read_csv(CSV_PATH).tail(5000).astype(object).where(lambda d: d.notnull(), None).to_dict("records"):
            rows.append(r)
    except Exception as e:
        print("[log] could not read legacy CSV:", e)

def log_row(row: dict):
    rows.append(row)
    if len(rows) > 5000: del rows[:1000]
    new = not os.path.exists(CSV_PATH)
    try:
        with open(CSV_PATH, "a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=CSV_COLS, extrasaction="ignore")
            if new: w.writeheader()
            w.writerow(row)
    except Exception as e:
        store.fail += 1; print("[log] csv write failed:", e)

def maybe_train(row: dict, node_level: str):
    """Never train on danger events, sensor faults, scenario data or corrupt telemetry: only REAL, SAFE, low-deviation rows."""
    global model, train_ok, last_train_n
    if node_level != "SAFE" or row.get("alarm") or abs(row.get("pitch_dev") or 0) > 3 or abs(row.get("roll_dev") or 0) > 3 or row.get("sound") is None:
        return
    train_ok += 1
    if train_ok >= MIN_ROWS and (train_ok - last_train_n) >= 20:
        good = [r for r in rows if r.get("sound") is not None and r.get("risk") is not None and r["risk"] < 35 and not r.get("alarm")][-500:]
        if len(good) < MIN_ROWS: return
        X = pd.DataFrame([[r["pitch_dev"], r["roll_dev"], r["sound"]] for r in good], columns=["pitch_dev", "roll_dev", "sound"])
        model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42).fit(X)
        last_train_n = train_ok
        model_meta.update(version=f"live-{int(time.time())}", samples=len(good), last_trained=datetime.now().isoformat(), source="live REAL SAFE-only readings", status="ACTIVE")
        print(f"[AI] retrained on {len(good)} SAFE real readings")

def ai_for(n):
    if model is None or n.recv == 0:
        return {"verdict": "insufficient_data", "score": None, "layer": "IsolationForest (one evidence layer)"}
    x = [[n.dev["pitch"], n.dev["roll"], n.dev["vib"]]]
    try:
        v = "anomaly" if model.predict(x)[0] == -1 else "normal"; sc = float(model.decision_function(x)[0])
    except Exception:
        return {"verdict": "insufficient_data", "score": None, "layer": "IsolationForest"}
    return {"verdict": v, "score": round(sc, 3), "layer": "IsolationForest (one evidence layer)",
            "physical_support": [c["label"] for c in n.contrib if c["points"] > 0],
            "statement": ("AI anomaly detected AND physical evidence supports it" if v == "anomaly" and n.risk >= 35 else
                          "AI anomaly flagged but physical evidence does not support structural risk" if v == "anomaly" else "AI: consistent with learned normal")}

# ---------------- WebSocket manager ----------------
class Manager:
    def __init__(self): self.active: List[WebSocket] = []
    async def connect(self, ws): await ws.accept(); self.active.append(ws)
    def disconnect(self, ws):
        if ws in self.active: self.active.remove(ws)
    async def broadcast(self, msg):
        for ws in list(self.active):
            try: await ws.send_json(msg)
            except Exception: self.disconnect(ws)
manager = Manager()

async def flush_outbox():
    ev, platform.outbox = platform.outbox, []
    for e in ev: await manager.broadcast(e)

def full_state():
    return views.build_state(platform, ai_for)

async def push_state():
    await manager.broadcast({"type": "state", "state": json.loads(json.dumps(full_state(), default=str))})

def admin(x_admin_token: Optional[str] = Header(None)):
    if C.ADMIN_TOKEN and x_admin_token != C.ADMIN_TOKEN:
        raise HTTPException(401, "admin token required")

# ---------------- background loop ----------------
async def loop():
    n = 0
    while True:
        await asyncio.sleep(1)
        try:
            scen.step(); platform.tick(); n += 1
            await flush_outbox()
            await push_state()
            if n % 5 == 0:
                await manager.broadcast({"type": "system_health", "health": views.system_health(platform, len(manager.active), model_meta)})
        except Exception as e:
            print("[loop] error:", repr(e))

@app.on_event("startup")
async def _start():
    asyncio.create_task(loop())

# ---------------- legacy ingestion (backward compatible) ----------------
class Reading(BaseModel):
    node_id: str = Field("NODE-01", max_length=32)
    pitch: Optional[float] = None; roll: Optional[float] = None
    pitch_dev: Optional[float] = None; roll_dev: Optional[float] = None
    sound: Optional[float] = None; temp: Optional[float] = None; humidity: Optional[float] = None
    temperature: Optional[float] = None; vibration: Optional[float] = None; strain: Optional[float] = None; strain_dev: Optional[float] = None
    alarm: Optional[bool] = False
    rssi: Optional[int] = None; power_source: Optional[str] = None; link_mode: Optional[str] = "USB-Serial"
    battery_pct: Optional[int] = None; battery_sensing_ok: Optional[bool] = None
    sequence: Optional[int] = None; timestamp: Optional[str] = None; bridge_ts: Optional[float] = None; buffered: Optional[bool] = False
    firmware_version: Optional[str] = None; uptime: Optional[float] = None; calibration_status: Optional[str] = None
    sensor_health: Optional[Dict[str, Any]] = None
    mpu_available: Optional[bool] = None; strain_available: Optional[bool] = None; sound_available: Optional[bool] = None
    temp_available: Optional[bool] = None; hum_available: Optional[bool] = None
    class Config: extra = "allow"

@app.get("/")
def root():
    return {"status": "running", "message": "SAMADHAAN backend v6 -- POST telemetry to /api/v1/telemetry/esp32", "docs": "/docs"}

@app.post("/api/v1/telemetry/esp32")
@app.post("/sensor-data")
async def receive(reading: Reading):
    d = reading.dict()
    d["strain_dev"] = d["strain_dev"] if d["strain_dev"] is not None else None
    ts = d.get("bridge_ts") or None
    n = platform.ingest(d, "REAL", ts=ts, buffered=bool(d.get("buffered")))
    if n is None:
        return {"received": False, "reason": "duplicate or rejected packet"}
    if ts and not d.get("buffered"): platform.latencies.append(max(0, (time.time() - ts) * 1000))
    stamp = datetime.fromtimestamp(ts or time.time()).isoformat()
    row = {"timestamp": stamp, "node_id": d["node_id"], "pitch": d["pitch"], "roll": d["roll"], "pitch_dev": d["pitch_dev"], "roll_dev": d["roll_dev"],
           "sound": d["sound"] if d["sound"] is not None else d["vibration"], "temp": d["temp"] if d["temp"] is not None else d["temperature"], "humidity": d["humidity"],
           "alarm": d["alarm"], "rssi": d["rssi"], "power_source": d["power_source"], "link_mode": d["link_mode"], "battery_pct": d["battery_pct"],
           "battery_sensing_ok": d["battery_sensing_ok"], "risk": n.risk}
    log_row(row); maybe_train(row, n.level)
    ai = ai_for(n); n.ai = ai
    payload = {"type": "telemetry", "source": "REAL", "node_id": n.id, "timestamp": stamp, "pitch_dev": n.dev["pitch"], "roll_dev": n.dev["roll"], "sound": row["sound"],
               "temp": row["temp"], "humidity": d["humidity"], "rssi": n.rssi, "power_source": n.power, "link_mode": n.link, "battery_pct": d["battery_pct"],
               "battery_sensing_ok": d["battery_sensing_ok"], "threshold_alarm": d["alarm"], "ai_verdict": ai["verdict"], "anomaly_score": ai["score"],
               "risk_score": n.risk, "risk_level": n.level, "confidence": n.conf, "decision": n.decision, "rows_logged": len(rows)}
    if n.risk >= EVAC_THRESHOLD:
        exists = os.path.exists(EVAC_LOG_PATH)
        pd.DataFrame([{"timestamp": stamp, "node_id": n.id, "risk_score": n.risk, "threshold": EVAC_THRESHOLD, "status": "TRIGGERED"}]).to_csv(EVAC_LOG_PATH, mode="a", header=not exists, index=False)
    await manager.broadcast(payload); await flush_outbox()
    return {"received": True, **payload}

@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    await manager.connect(ws)
    try:
        await ws.send_json({"type": "state", "state": json.loads(json.dumps(full_state(), default=str))})
        while True: await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)

def _clean(recs): return [{k: (None if (isinstance(v, float) and v != v) else v) for k, v in r.items()} for r in recs]

@app.get("/history")
def history(limit: int = 200): return _clean(rows[-limit:])

@app.get("/stats")
def stats():
    if not rows: return {"rows": 0}
    df = pd.DataFrame(rows)
    return {"rows": len(df), "alarms_triggered": int(df["alarm"].fillna(False).astype(bool).sum()), "avg_pitch_dev": float(df["pitch_dev"].astype(float).mean()),
            "avg_roll_dev": float(df["roll_dev"].astype(float).mean()), "max_pitch_dev": float(df["pitch_dev"].astype(float).abs().max()),
            "max_roll_dev": float(df["roll_dev"].astype(float).abs().max()), "model_trained": model is not None, "model_source": model_meta["source"]}

def _ai_summary():
    n = platform.nodes["NODE-01"]
    if n.recv == 0: return {"note": "No telemetry received yet."}
    score, lvl = n.risk, n.level
    win = {"CRITICAL": "0-6 hours", "HIGH": "6-24 hours", "CAUTION": "24-72 hours"}.get(lvl, "No near-term failure indicated")
    ai = ai_for(n)
    return {"risk_level": {"SAFE": "LOW", "CAUTION": "MODERATE", "HIGH": "HIGH", "CRITICAL": "CRITICAL", "UNKNOWN": "LIMITED DATA"}[lvl], "failure_window_estimate": win + " (trend projection, not a validated forecast)",
            "structural_stability_index": {"SAFE": "Stable", "CAUTION": "Stable, trending", "HIGH": "Degrading", "CRITICAL": "Compromised", "UNKNOWN": "Cannot assess"}[lvl],
            "narrative": (f"Pitch deviation {n.dev['pitch']:.1f} deg, roll deviation {n.dev['roll']:.1f} deg vs this node's self-learned baseline. Explainable risk {score}/100 "
                          f"({', '.join(f'{c['label']} {c['points']}' for c in n.contrib if c['points'] > 0) or 'no active evidence'}). {ai.get('statement', '')}"),
            "recommendation": n.decision, "generated_at": datetime.now().isoformat(),
            "note": "Rule-based summary from live telemetry. " + C.THRESHOLD_NOTE + ". Not a substitute for licensed geotechnical assessment."}

@app.get("/api/v1/ai-summary")
def ai_summary(): return _ai_summary()

def project_trend(df, hours):
    if len(df) < 5: return {f"{h}h": None for h in hours}
    rec = df.tail(50).copy(); y = rec[["pitch_dev", "roll_dev"]].astype(float).abs().max(axis=1).values; x = np.arange(len(y))
    if len(y) < 2 or np.all(y == y[0]): return {f"{h}h": round(float(y[-1]), 2) for h in hours}
    slope, icpt = np.polyfit(x, y, 1)
    try:
        d = pd.to_datetime(rec["timestamp"]).diff().dt.total_seconds().dropna(); spr = float(d.median()) if len(d) and d.median() > 0 else 3.0
    except Exception: spr = 3.0
    spr = max(0.5, min(spr, 60.0)); ceil = min(90.0, max(float(y.max()) * 6, 15.0))
    return {f"{h}h": round(float(max(0.0, min(slope * ((len(y) - 1) + h * 3600 / spr) + icpt, ceil))), 2) for h in hours}

@app.get("/api/v1/projection")
def projection():
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["pitch_dev", "roll_dev", "timestamp"])
    return {"projections": project_trend(df, [6, 12, 24, 48]), "label": "OBSERVED vs PROJECTED: values below are a mathematical TREND PROJECTION (ESTIMATED)",
            "method": "linear trend extrapolation of recent deviation rate-of-change", "disclaimer": "Trend projection only \u2014 not a validated long-range geotechnical forecast."}

@app.get("/api/v1/evacuation-log")
def evac_log():
    return pd.read_csv(EVAC_LOG_PATH).to_dict("records") if os.path.exists(EVAC_LOG_PATH) else []

# ---------------- v1 API ----------------
@app.get("/api/v1/dashboard/summary")
def summary(): return json.loads(json.dumps(full_state(), default=str))

@app.get("/api/v1/nodes")
def nodes():
    st = full_state()
    return [{**v, "node_id": v["id"], "installed": True} for v in st["nodes"]]

class NodeConfig(BaseModel):
    node_id: str; label: str; lat: float; lng: float; depth_m: Optional[float] = None

@app.post("/api/v1/nodes")
def upsert_node(node: NodeConfig, _=Depends(admin)):
    cur = json.load(open(NODES_PATH)) if os.path.exists(NODES_PATH) else []
    cur = [x for x in cur if x["node_id"] != node.node_id] + [node.dict()]
    json.dump(cur, open(NODES_PATH, "w"), indent=2); return {"saved": True, "nodes": cur}

@app.get("/api/v1/nodes/{node_id}")
def node(node_id: str):
    n = platform.nodes.get(node_id)
    if not n: raise HTTPException(404, "unknown node")
    return views.node_view(platform, n, time.time(), ai_for(n))

@app.get("/api/v1/nodes/{node_id}/health")
def node_health(node_id: str):
    n = platform.nodes.get(node_id)
    if not n: raise HTTPException(404, "unknown node")
    return {"node_id": node_id, "source": n.source, "sensors": views.sensor_health(n, time.time()), "quality": n.qual, "reliability": views.node_view(platform, n, time.time())["reliability"],
            "note": "NODE HEALTH (can I trust this node?) is separate from STRUCTURAL RISK (what is happening to the mine?)"}

@app.get("/api/v1/nodes/{node_id}/history")
def node_history(node_id: str, range: str = "10m", start: Optional[float] = None, end: Optional[float] = None, max_points: int = 400):
    n = platform.nodes.get(node_id)
    if not n: raise HTTPException(404, "unknown node")
    span = {"1m": 60, "10m": 600, "1h": 3600, "1d": 86400}.get(range, 600); now = time.time()
    lo, hi = (start, end or now) if (range == "custom" and start) else (now - span, now)
    pts = [h for h in n.hist if lo <= h["ts"] <= hi]
    if lo < (n.hist[0]["ts"] if n.hist else now):
        pts = [{k: h.get(k) for k in ("ts", "pitch_dev", "roll_dev", "strain_dev", "vibration", "temperature", "humidity", "risk", "battery_pct")} for h in store.telemetry_recent(node_id, 5000, since=lo, source=n.source) if h["ts"] <= hi] or pts
    step = max(1, len(pts) // max_points)
    return {"node_id": node_id, "source": n.source, "range": range, "points": pts[::step], "label": "OBSERVED telemetry" + (" (SIMULATION)" if n.source == "SIMULATION" else "")}

@app.get("/api/v1/risk/{node_id}")
def risk(node_id: str):
    n = platform.nodes.get(node_id)
    if not n: raise HTTPException(404, "unknown node")
    v = views.node_view(platform, n, time.time(), ai_for(n))
    return {k: v[k] for k in ("id", "source", "risk", "level", "confidence", "confidence_why", "contributions", "notes", "decision", "corroborating", "ai")} | {"thresholds": C.LEVELS, "weights": C.WEIGHTS, "note": C.THRESHOLD_NOTE}

@app.get("/api/v1/baselines/{node_id}")
def baselines(node_id: str):
    v = node(node_id); return {"node_id": node_id, "baseline": v["baseline"], "learning": v["learning"], "freeze_reason": v["freeze_reason"], "alpha": C.BASELINE_ALPHA, "type": "SELF-LEARNED per node"}

@app.post("/api/v1/nodes/{node_id}/calibrate")
def calibrate(node_id: str, _=Depends(admin)):
    if node_id not in platform.nodes: raise HTTPException(404, "unknown node")
    b = platform.calibrate(node_id)
    if not b: raise HTTPException(409, "no valid readings yet \u2014 keep node stationary and retry")
    return {"node_id": node_id, "baseline": {k: v["v"] for k, v in b.items()}, "message": "baseline saved from current stationary readings"}

@app.get("/api/v1/incidents")
def incidents(status: Optional[str] = None, limit: int = 100):
    out = sorted(platform.incidents.values(), key=lambda i: -i["ts"])
    return [i for i in out if not status or i["status"] == status.upper()][:limit]

class ActionBody(BaseModel):
    by: str = "engineer"; note: Optional[str] = None

def _act(iid, action, body):
    inc = platform.incident_action(iid, action, body.by, body.note)
    if not inc: raise HTTPException(404, "unknown incident")
    return inc

@app.post("/api/v1/incidents/{iid}/acknowledge")
def inc_ack(iid: str, body: ActionBody = ActionBody(), _=Depends(admin)): return _act(iid, "ACKNOWLEDGE", body)
@app.post("/api/v1/incidents/{iid}/assign")
def inc_assign(iid: str, body: ActionBody = ActionBody(), _=Depends(admin)): return _act(iid, "ASSIGN", body)
@app.post("/api/v1/incidents/{iid}/investigate")
def inc_inv(iid: str, body: ActionBody = ActionBody(), _=Depends(admin)): return _act(iid, "INVESTIGATE", body)
@app.post("/api/v1/incidents/{iid}/resolve")
def inc_res(iid: str, body: ActionBody = ActionBody(), _=Depends(admin)): return _act(iid, "RESOLVE", body)
@app.post("/api/v1/incidents/{iid}/escalate")
def inc_esc(iid: str, body: ActionBody = ActionBody(), _=Depends(admin)): return _act(iid, "ESCALATE", body)

class EscalateBody(BaseModel):
    by: str = "control-room"; note: Optional[str] = None
escalations: List[dict] = []
@app.post("/api/v1/escalate")
def escalate(body: EscalateBody = EscalateBody(), _=Depends(admin)):
    rec = {"ts": time.time(), "by": body.by, "note": body.note}
    escalations.append(rec); platform.log_event("COMMUNICATION ISSUE", "NODE-01", f"Emergency escalation recorded by {body.by}")
    return {"recorded": True, "escalations": len(escalations), "note": "Escalation is logged and broadcast to every connected console. No SMS/email provider is configured in this deployment, so no external message is sent."}
@app.get("/api/v1/escalations")
def get_escalations(): return escalations

@app.get("/api/v1/alerts")
def get_alerts(): return full_state()["alerts"]
@app.post("/api/v1/alerts/{aid}/acknowledge")
def ack_alert(aid: str, _=Depends(admin)):
    platform.acked_alerts.add(aid); return {"acknowledged": aid}

@app.get("/api/v1/analytics")
def analytics(range: str = "1H"): return views.analytics(platform, range.upper())
@app.get("/api/v1/network")
def network(): return views.network(platform)
@app.get("/api/v1/system-health")
def system_health(): return views.system_health(platform, len(manager.active), model_meta)
@app.get("/api/v1/digital-twin")
def digital_twin(layer: str = "node", window: str = "current"):
    vs = [views.node_view(platform, n, time.time()) for n in platform.nodes.values()]
    return views.twin(platform, vs, layer, window)
@app.get("/api/v1/routes")
def routes(): return platform.routes
@app.get("/api/v1/mine")
def mine():
    return {"primary": M.MINE, "other_mines": M.OTHER_MINES, "note": "Illustrative configuration \u2014 not surveyed mine data",
            "distances": {f"{a['id']}<->{b['id']}": M.node_dist(a, b) for a in M.NODES for b in M.NODES if a['id'] < b['id']}}

# ---- demo / scenarios ----
class DemoBody(BaseModel): active: bool
@app.post("/api/v1/demo")
def demo(b: DemoBody, _=Depends(admin)):
    if not b.active: scen.reset()
    platform.demo["active"] = b.active
    return platform.demo

@app.get("/api/v1/scenarios/presets")
def presets(): return {"presets": PRESETS, "demos": DEMO_KEYS}
@app.post("/api/v1/scenarios")
def create_scenario(params: Dict[str, Any], _=Depends(admin)): return scen.create(params)
@app.post("/api/v1/scenarios/{sid}/run")
def run_scenario(sid: str, _=Depends(admin)):
    r = scen.run(sid)
    if not r: raise HTTPException(404, "unknown scenario")
    return r
@app.post("/api/v1/scenarios/{sid}/stop")
def stop_scenario(sid: str, _=Depends(admin)):
    scen.stop(); return scen.public(scen.cur)
@app.get("/api/v1/scenarios/{sid}/state")
def scenario_state(sid: str):
    if scen.cur and scen.cur["id"] == sid: return scen.public(scen.cur)
    raise HTTPException(404, "scenario not active")
@app.get("/api/v1/scenarios/{sid}/report")
def scenario_report(sid: str):
    for s in store.all("scenarios"):
        if s["id"] == sid: return s["report"]
    raise HTTPException(404, "no report yet")
@app.post("/api/v1/scenarios/run-demo/{key}")
def run_demo(key: str, _=Depends(admin)):
    preset = DEMO_KEYS.get(key.upper(), key)
    if preset not in PRESETS: raise HTTPException(404, "unknown scenario preset")
    d = scen.create({"preset": preset}); return scen.run(d["id"])
@app.post("/api/v1/reset")
def reset(_=Depends(admin)):
    scen.reset(); platform.demo.update(active=False, scenario_id=None); return {"reset": True, "note": "real telemetry history untouched"}

# ---- bridge status / offline sync (reported by serial_bridge.py) ----
class BridgeStatus(BaseModel):
    connected: bool = False; port: Optional[str] = None; baud: Optional[int] = None; packets_per_s: float = 0.0; buffered: int = 0
    forwarded: int = 0; errors: int = 0; last_packet_age: Optional[float] = None
@app.post("/api/v1/bridge/status")
def bridge_status(b: BridgeStatus):
    platform.bridge = {**b.dict(), "updated": time.time()}; return {"ok": True}
@app.get("/api/v1/bridge/status")
def bridge_get(): return platform.bridge
