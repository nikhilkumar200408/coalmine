"""Core SAMADHAAN pipeline. Real (ESP32) and simulated (scenario) telemetry BOTH enter ingest() and
go through the same: validate -> quality -> baseline -> transient separation -> correlation ->
explainable risk -> incident logic. Every reading carries an explicit source (REAL | SIMULATION)."""
import math, time, collections
from . import config as C, mine as M
from .store import Store

def num(x):
    try:
        if x is None or isinstance(x, bool):
            return None
        x = float(x)
        return None if math.isnan(x) or math.isinf(x) else x
    except (TypeError, ValueError):
        return None

def clip(x, a=0.0, b=1.0):
    return max(a, min(b, x))

def level_of(score):
    for t, name in C.LEVELS:
        if score >= t:
            return name
    return "SAFE"

SENSORS = {"MPU6050": ("pitch", "roll"), "Flex/Strain": ("strain_dev",), "Sound/Vibration": ("vibration",),
           "Temperature": ("temperature",), "Humidity": ("humidity",), "Battery": ("battery_pct",)}
CHANNELS = [c for chs in SENSORS.values() for c in chs]
BASE_CH = ("pitch", "roll", "strain_dev", "vibration", "temperature", "humidity")
STATUS_OF = {"SAFE": "NORMAL", "CAUTION": "ATTENTION", "HIGH": "CRITICAL", "CRITICAL": "CRITICAL", "UNKNOWN": "DEGRADED"}

class Node:
    def __init__(self, meta):
        self.id, self.meta, self.source = meta["id"], meta, meta["source"]
        self.last_seen = 0.0; self.last_ts = None
        self.v = {c: None for c in CHANNELS}          # latest valid value per channel
        self.lastt = {}                                # channel -> ts of last valid value
        self.cnt = {c: collections.deque(maxlen=20) for c in CHANNELS}
        self.qual = {c: "MISSING" for c in CHANNELS}
        self.recent = {c: collections.deque(maxlen=30) for c in ("pitch", "roll", "strain_dev", "vibration")}
        self.base, self.hist = {}, collections.deque(maxlen=7200)
        self.persist = 0.0; self.trend = 0.0
        self.risk = 0; self.level = "UNKNOWN"; self.conf = 0; self.contrib = []; self.notes = []
        self.decision = "WAITING FOR TELEMETRY"; self.corr = 0
        self.transient = None; self.events = collections.deque(maxlen=50)
        self.recv = 0; self.lost = 0; self.last_seq = None; self.seen = collections.deque(maxlen=256)
        self.transports = {}; self.rssi = None; self.link = None; self.power = None
        self.fw = meta.get("firmware"); self.uptime = None; self.calib = "AUTO (self-learning)"
        self.learning = "WARMUP"; self.freeze_reason = None; self.ai = None
        self.dev = {"pitch": 0.0, "roll": 0.0, "strain": 0.0, "vib": 0.0}
        self.prev_level = "UNKNOWN"; self.prev_status = None; self.sensor_state = {}
        self.was_offline = True; self.online_s = 0.0; self.total_s = 1.0; self.sim_frozen = False

class Platform:
    def __init__(self, store: Store):
        self.store = store
        self.nodes = {m["id"]: Node(m) for m in M.NODES}
        self.outbox = []                                # WebSocket events flushed by the async layer
        self.incidents = {}
        self.vent = {s: "NORMAL" for s in M.SECTORS}    # MODELLED / SIMULATED
        self.workers = {s: v["workers"] for s, v in M.SECTORS.items()}
        self.demo = {"active": False, "scenario_id": None}
        self.scenario = None                            # set by ScenarioEngine
        self.cls = collections.Counter(); self.class_log = collections.deque(maxlen=200)
        self.risk_hist = collections.deque(maxlen=17280)  # 5s samples (~24h)
        self.sync = {"state": "IDLE", "buffered": 0, "synced": 0, "last_buffered_ts": 0.0}
        self.pipeline_offline = False; self.dup = 0; self.bridge = {}; self.acked_alerts = set()
        self.route_sig = {}; self.routes = {}; self.route_changes = 0
        self.t0 = time.time(); self.latencies = collections.deque(maxlen=50)
        self.model_info = {"version": "unloaded", "samples": 0, "last_trained": None, "source": "none", "status": "none"}
        self._restore()

    # ---------------- persistence ----------------
    def _restore(self):
        for inc in self.store.all("incidents"):
            self.incidents[inc["id"]] = inc
        for b in self.store.all("baselines"):
            n = self.nodes.get(b.get("node_id"))
            if n:
                n.base = b["base"]; n.learning = "ACTIVE"; n.calib = b.get("calib", n.calib)
        real = self.nodes["NODE-01"]
        for r in self.store.telemetry_recent("NODE-01", 600, source="REAL"):
            real.hist.append({k: r.get(k) for k in ("ts", "pitch_dev", "roll_dev", "strain_dev", "vibration", "temperature", "humidity", "risk", "battery_pct")})
        for e in self.store.all("events")[-200:]:
            self.class_log.append(e); self.cls[e.get("category", "NORMAL")] += 1

    def emit(self, typ, data):
        self.outbox.append({"type": typ, **data})

    def next_id(self, key, prefix):
        n = (self.store.kv_get(key, 0) or 0) + 1
        self.store.kv_set(key, n)
        return f"{prefix}-{n:04d}"

    def log_event(self, category, node_id, msg, ts=None):
        e = {"ts": ts or time.time(), "category": category, "node_id": node_id, "message": msg,
             "source": self.nodes[node_id].source if node_id in self.nodes else "SYSTEM"}
        self.cls[category] += 1; self.class_log.append(e); self.store.add_event(e["ts"], e)
        if node_id in self.nodes:
            self.nodes[node_id].events.append(e)

    # ---------------- ingest ----------------
    def ingest(self, r: dict, source: str, ts=None, buffered=False):
        nid = r.get("node_id") or "NODE-01"
        n = self.nodes.get(nid)
        if n is None:                                  # unknown physical node: register it dynamically
            meta = {"id": nid, "label": "Auto-registered node", "source": source, "sector": "A", "gallery": "-", "junction": "J2",
                    "depth_m": None, "installed": "auto", "firmware": r.get("firmware_version"), "x": 220, "y": 60, "lat": M.ORIGIN[0], "lng": M.ORIGIN[1], "nearby": []}
            n = self.nodes[nid] = Node(meta)
        if n.source != source:
            return None                                # never let one source impersonate the other
        now = ts or time.time()
        seq = num(r.get("sequence"))
        if seq is not None:
            seq = int(seq)
            if n.last_seq is not None and seq < n.last_seq - 50:
                n.seen.clear(); n.last_seq = None      # device rebooted
            if seq in n.seen:
                self.dup += 1; return None
            n.seen.append(seq)
            if n.last_seq is not None and 0 < seq - n.last_seq < 1000:
                n.lost += seq - n.last_seq - 1
            n.last_seq = seq if n.last_seq is None else max(n.last_seq, seq)
        n.recv += 1; n.offline = False
        dt = 0.0 if n.last_ts is None else max(0.0, min(now - n.last_ts, 30.0))
        n.last_ts = max(now, n.last_ts or 0); n.last_seen = time.time() if not buffered else n.last_seen or time.time()
        if buffered:
            self.sync.update(state="SYNCING", last_buffered_ts=time.time()); self.sync["buffered"] += 1
        if n.was_offline:
            n.was_offline = False
            if n.recv > 1:
                self.log_event("COMMUNICATION ISSUE", nid, f"{nid} RECOVERED (link restored)", now)
        # transport / meta
        link = r.get("link_mode") or n.link
        if link:
            n.transports[link] = time.time()
        n.link = max(n.transports, key=n.transports.get) if n.transports else n.link
        n.rssi = num(r.get("rssi")) if link == "WiFi" else None
        n.power = r.get("power_source") or n.power; n.fw = r.get("firmware_version") or n.fw
        n.uptime = num(r.get("uptime")) if r.get("uptime") is not None else n.uptime
        if r.get("calibration_status"):
            n.calib = r["calibration_status"]

        raw = self._normalise(r)
        for ch, val in raw.items():
            if ch.startswith("_"):
                continue
            if val is None:
                n.qual[ch] = "MISSING"; continue
            if self._outlier(ch, val):
                n.qual[ch] = "OUTLIER"; continue
            n.qual[ch] = "GOOD"; n.v[ch] = val; n.lastt[ch] = now; n.cnt[ch].append(now)
            if ch in n.recent:
                n.recent[ch].append(val)
        mpu = raw["pitch"] is not None and n.qual["pitch"] == "GOOD"
        st = raw["strain_dev"] is not None and n.qual["strain_dev"] == "GOOD"
        vb = raw["vibration"] is not None and n.qual["vibration"] == "GOOD"
        sensor_now = {"MPU6050": mpu, "Flex/Strain": st, "Sound/Vibration": vb}
        for k, ok in sensor_now.items():
            was = n.sensor_state.get(k)
            if was is True and not ok and self.demo_or_real(n):
                self.emit("sensor_fault", {"node_id": nid, "sensor": k}); self.log_event("SENSOR FAULT", nid, f"{k} stopped reporting on {nid}", now)
            n.sensor_state[k] = ok
        self._baseline(n, raw, mpu, st, vb, now, dt)
        self._assess(n, raw, mpu, st, vb, now, dt)
        fw_p = num(r.get("pitch_dev")); fw_r = num(r.get("roll_dev"))
        rec = {"ts": now, "pitch_dev": n.dev["pitch"] if mpu else None, "roll_dev": n.dev["roll"] if mpu else None,
               "strain_dev": n.dev["strain"] if st else None, "vibration": n.v["vibration"] if vb else None,
               "temperature": n.v["temperature"], "humidity": n.v["humidity"], "battery_pct": n.v["battery_pct"], "risk": n.risk}
        n.hist.append(rec)
        self.store.add_telemetry(now, nid, source, {**rec, "fw_pitch_dev": fw_p, "fw_roll_dev": fw_r, "seq": seq, "link": n.link, "buffered": buffered})
        self._incident(n, now)
        if n.level != n.prev_level:
            self.emit("risk_update", {"node_id": nid, "level": n.level, "risk": n.risk, "source": source})
            n.prev_level = n.level
        return n

    def demo_or_real(self, n):
        return n.source == "REAL" or self.demo["active"]

    @staticmethod
    def _normalise(r):
        def flag(k):
            return r.get(k) is not False
        pct = num(r.get("battery_pct"))
        if pct is not None and (pct < 0 or r.get("battery_sensing_ok") is False):
            pct = None
        mpu = flag("mpu_available")
        return {"pitch": num(r.get("pitch")) if mpu else None, "roll": num(r.get("roll")) if mpu else None,
                "strain_dev": num(r.get("strain_dev")) if flag("strain_available") else None,
                "vibration": num(r.get("vibration") if r.get("vibration") is not None else r.get("sound")) if flag("sound_available") else None,
                "temperature": num(r.get("temperature") if r.get("temperature") is not None else r.get("temp")) if flag("temp_available") else None,
                "humidity": num(r.get("humidity")) if flag("hum_available") else None, "battery_pct": pct,
                "_pd": num(r.get("pitch_dev")), "_rd": num(r.get("roll_dev"))}

    @staticmethod
    def _outlier(ch, v):
        return ((ch in ("pitch", "roll") and abs(v) > 90) or (ch == "temperature" and not -20 <= v <= 80) or
                (ch == "humidity" and not 0 <= v <= 100) or (ch == "battery_pct" and not 0 <= v <= 100) or (ch == "vibration" and v < 0))

    # ---------------- baseline (per node, self-learned) ----------------
    def _baseline(self, n, raw, mpu, st, vb, now, dt):
        allowed = n.level in ("SAFE", "UNKNOWN") and n.transient is None and not n.sim_frozen and mpu
        reason = None
        if n.level in ("CAUTION", "HIGH", "CRITICAL"): reason = f"risk {n.level}"
        elif n.transient is not None: reason = "active anomaly"
        elif n.sim_frozen: reason = "active scenario"
        elif not mpu: reason = "sensor fault"
        n.freeze_reason = reason
        prev = n.learning
        for ch in BASE_CH:
            v = n.v.get(ch)
            if v is None or n.qual[ch] != "GOOD":
                continue
            b = n.base.get(ch)
            if b is None:
                n.base[ch] = {"v": v, "v0": v, "n": 1, "t0": now, "t": now}
            elif b["n"] < C.BASELINE_WARMUP:                      # warm-up: cumulative mean
                b["n"] += 1; b["v"] += (v - b["v"]) / b["n"]; b["t"] = now
            elif allowed:                                          # slow adaptation only when stable
                b["v"] = (1 - C.BASELINE_ALPHA) * b["v"] + C.BASELINE_ALPHA * v; b["t"] = now
        warm = all(n.base.get(c, {}).get("n", 0) >= C.BASELINE_WARMUP for c in ("pitch", "roll") if n.v.get(c) is not None) and "pitch" in n.base
        n.learning = "WARMUP" if not warm else ("ACTIVE" if allowed else "FROZEN")
        if n.learning != prev:
            self.emit("baseline_updated", {"node_id": n.id, "learning": n.learning})
        # deviations vs the node's OWN baseline (fall back to firmware dev before warm-up)
        if mpu:
            n.dev["pitch"] = (n.v["pitch"] - n.base["pitch"]["v"]) if warm else (raw["_pd"] if raw["_pd"] is not None else 0.0)
            n.dev["roll"] = (n.v["roll"] - n.base["roll"]["v"]) if warm else (raw["_rd"] if raw["_rd"] is not None else 0.0)
        n.dev["strain"] = n.v["strain_dev"] if st else 0.0
        n.dev["vib"] = max(0.0, n.v["vibration"] - n.base.get("vibration", {"v": 0})["v"]) if vb else 0.0

    def calibrate(self, node_id):
        n = self.nodes.get(node_id)
        if not n:
            return None
        for ch in BASE_CH:
            if n.v.get(ch) is not None:
                n.base[ch] = {"v": n.v[ch], "v0": n.v[ch], "n": C.BASELINE_WARMUP, "t0": time.time(), "t": time.time()}
        n.calib = f"CALIBRATED {time.strftime('%H:%M:%S')}"; n.learning = "ACTIVE"
        self.store.upsert("baselines", node_id, {"node_id": node_id, "base": n.base, "calib": n.calib})
        self.emit("baseline_updated", {"node_id": node_id, "learning": "ACTIVE", "calibrated": True})
        return n.base

    # ---------------- correlation + explainable risk ----------------
    def _assess(self, n, raw, mpu, st, vb, now, dt):
        tilt = max(abs(n.dev["pitch"]), abs(n.dev["roll"])) if mpu else 0.0
        sd = abs(n.dev["strain"]) if st else 0.0
        vd = n.dev["vib"]
        tilt_on, strain_on = tilt > C.TILT_ACTIVE_DEG, sd > C.STRAIN_ACTIVE_PCT
        struct_on = tilt_on or strain_on
        vib_on = vb and vd > C.VIB_SPIKE
        n.persist = n.persist + dt if struct_on else max(0.0, n.persist - 2 * dt)
        idx = max(tilt / C.TILT_FULL_DEG, sd / C.STRAIN_FULL_PCT)
        h = n.hist
        n.trend = 0.0
        if len(h) >= 8:
            pts = [(x["ts"], max(abs(x["pitch_dev"] or 0) / C.TILT_FULL_DEG, abs(x["strain_dev"] or 0) / C.STRAIN_FULL_PCT)) for x in list(h)[-30:]]
            pts.append((now, idx)); t0 = pts[0][0]; xs = [(p[0] - t0) / 60 for p in pts]; ys = [p[1] for p in pts]
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys); den = sum((x - mx) ** 2 for x in xs)
            n.trend = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den > 1e-9 else 0.0
        W = C.WEIGHTS
        c_tilt = W["tilt"] * clip(tilt / C.TILT_FULL_DEG)
        c_str = W["strain"] * clip(sd / C.STRAIN_FULL_PCT)
        c_per = W["persistence"] * clip(n.persist / C.PERSIST_FULL_S) if struct_on else 0.0
        c_trd = W["trend"] * clip(n.trend / C.TREND_FULL_IDX_PER_MIN) if (struct_on and n.trend > 0) else 0.0
        c_vib = W["vibration"] * clip(vd / (3 * C.VIB_SPIKE)) if (vib_on and struct_on) else 0.0
        n.contrib = [
            {"key": "tilt", "label": "Tilt deviation", "value": f"{tilt:+.1f}\u00b0" if mpu else "n/a", "points": round(c_tilt, 1), "max": W["tilt"]},
            {"key": "strain", "label": "Strain deviation", "value": f"{n.dev['strain']:+.1f}%" if st else "not connected", "points": round(c_str, 1), "max": W["strain"]},
            {"key": "persistence", "label": "Persistence", "value": f"{n.persist:.0f} s", "points": round(c_per, 1), "max": W["persistence"]},
            {"key": "trend", "label": "Trend (rising deformation)", "value": f"{n.trend:+.2f} idx/min", "points": round(c_trd, 1), "max": W["trend"]},
            {"key": "vibration", "label": "Vibration confirmation", "value": ("YES" if (vib_on and struct_on) else "NO") if vb else "not connected", "points": round(c_vib, 1), "max": W["vibration"]}]
        n.risk = int(round(clip(c_tilt + c_str + c_per + c_trd + c_vib, 0, 100)))
        n.corr = sum([tilt_on, strain_on, bool(vib_on and struct_on), n.persist >= 10, n.trend > 0.05 and struct_on])
        # ---- temporary anomaly (separate from structural risk) ----
        notes = []
        if vib_on and not struct_on:
            if n.transient is None:
                n.transient = {"start": now, "peak": vd, "sensor": "Sound/Vibration"}
            n.transient["peak"] = max(n.transient["peak"], vd)
            n.transient["duration"] = now - n.transient["start"]
            notes.append("Vibration elevated but tilt and strain are normal \u2192 LIKELY TRANSIENT DISTURBANCE \u2192 NO SUBSIDENCE ALERT")
        elif n.transient is not None and (not vib_on or struct_on):
            tr = n.transient; tr["duration"] = now - tr["start"]
            cat = "STRUCTURAL ANOMALY" if (struct_on and tr["duration"] >= C.TRANSIENT_PERSIST_S) else "TEMPORARY DISTURBANCE"
            tr.update(ended=now, classification=cat, tilt_normal=not tilt_on, strain_normal=not strain_on)
            n.last_transient = tr
            self.log_event(cat, n.id, f"Vibration spike +{tr['peak']:.0f} for {tr['duration']:.1f}s \u2192 {cat}", now)
            n.transient = None
        if vib_on and struct_on:
            notes.append("Vibration corroborates tilt/strain \u2192 higher confidence")
        # ---- data confidence (prototype indicator) ----
        conf, why = 100, []
        age = time.time() - n.last_seen if n.last_seen else 999
        if not mpu: conf -= 35; why.append("MPU6050 unavailable")
        if not st: conf -= 15; why.append("strain sensor not connected")
        if not vb: conf -= 10; why.append("sound/vibration sensor not connected")
        if n.learning == "WARMUP": conf -= 15; why.append("baseline still warming up")
        if age > 5: conf -= 20; why.append("stale telemetry")
        if n.level in ("HIGH", "CRITICAL") and n.corr < 2: conf -= 10; why.append("few corroborating sensors")
        n.conf = int(clip(conf, 5, 100)) if not (n.recv == 0) else 0; n.conf_why = why
        # ---- level + decision ----
        if not mpu and not st:
            n.level = "UNKNOWN"; n.decision = "LIMITED ASSESSMENT \u2014 DATA CONFIDENCE DEGRADED"
            notes.append("MPU6050 OFFLINE \u2014 risk assessment limited (this is NOT a SAFE state)")
        else:
            n.level = level_of(n.risk)
            n.decision = {"SAFE": "NO SUBSIDENCE ALERT" if not n.transient else "NO SUBSIDENCE ALERT (transient disturbance)",
                          "CAUTION": "ELEVATED RISK \u2014 INCREASE MONITORING", "HIGH": "HIGH RISK \u2014 FIELD VERIFICATION REQUIRED",
                          "CRITICAL": "CRITICAL \u2014 FIELD VERIFICATION REQUIRED, ENGINEER CONFIRMATION FOR EVACUATION"}[n.level]
        if not mpu and st:
            notes.append("MPU6050 OFFLINE \u2014 tilt evidence unavailable, risk assessment limited")
            if n.level in ("SAFE", "CAUTION"):
                n.decision = "LIMITED ASSESSMENT \u2014 MPU6050 OFFLINE (not a SAFE indication)"
            if n.level == "SAFE":
                n.level = "UNKNOWN"      # sensor failure must never look like SAFE
        n.notes = notes

    # ---------------- incidents ----------------
    def _incident(self, n, now):
        if n.level not in ("HIGH", "CRITICAL"):
            return
        inc = next((i for i in self.incidents.values() if i["node_id"] == n.id and i["status"] != "RESOLVED"), None)
        ev = [f"{c['label']}: {c['value']} (+{c['points']} pts)" for c in n.contrib if c["points"] > 0]
        if inc is None:
            iid = self.next_id("inc_seq", "INC")
            inc = {"id": iid, "ts": now, "mine": M.MINE["name"], "sector": n.meta["sector"], "node_id": n.id, "severity": n.level,
                   "risk": n.risk, "peak_risk": n.risk, "evidence": ev, "source": n.source, "status": "NEW", "acknowledged_by": None,
                   "acknowledged_at": None, "assigned_to": None, "resolution_note": None, "scenario_id": self.demo["scenario_id"] if n.source == "SIMULATION" else None,
                   "actions": [{"ts": now, "action": "CREATED", "by": "system", "note": f"{n.level} risk {n.risk}/100"}],
                   "recommendation": "Recommended evacuation route shown in Worker view \u2014 engineer confirmation required"}
            self.incidents[iid] = inc; self.store.upsert("incidents", iid, inc)
            self.log_event("STRUCTURAL ANOMALY", n.id, f"{iid} created: {n.level} risk {n.risk}/100", now)
            self.emit("incident_created", {"incident": inc})
        else:
            changed = inc["severity"] != n.level
            inc.update(risk=n.risk, severity=n.level, evidence=ev, peak_risk=max(inc["peak_risk"], n.risk))
            if changed:
                self.store.upsert("incidents", inc["id"], inc); self.emit("incident_updated", {"incident": inc})

    def incident_action(self, iid, action, by="engineer", note=None):
        inc = self.incidents.get(iid)
        if not inc:
            return None
        now = time.time(); a = action.upper()
        if a == "ACKNOWLEDGE" and inc["status"] == "NEW":
            inc.update(status="ACKNOWLEDGED", acknowledged_by=by, acknowledged_at=now)
        elif a == "ASSIGN":
            inc.update(assigned_to=note or by)
        elif a == "INVESTIGATE":
            inc.update(status="INVESTIGATING")
        elif a == "RESOLVE":
            inc.update(status="RESOLVED", resolution_note=note or "resolved by engineer")
        elif a == "ESCALATE":
            inc["escalated"] = True; inc["escalated_by"] = by; inc["escalated_at"] = now
        inc["actions"].append({"ts": now, "action": a, "by": by, "note": note})
        self.store.upsert("incidents", iid, inc); self.emit("incident_updated", {"incident": inc})
        return inc

    # ---------------- periodic ----------------
    def tick(self, now=None):
        now = now or time.time()
        for n in self.nodes.values():
            live = n.source == "REAL" or self.demo["active"]
            n.total_s += 1
            offline = (not live) or n.last_seen == 0 or (time.time() - n.last_seen) > C.OFFLINE_AFTER_S
            if n.source == "SIMULATION" and not self.demo["active"]:
                offline = True
            if not offline: n.online_s += 1
            if offline and not n.was_offline and n.last_seen:
                n.was_offline = True
                if live:
                    self.log_event("COMMUNICATION ISSUE", n.id, f"{n.id} OFFLINE (no telemetry for {C.OFFLINE_AFTER_S:.0f}s)", now)
                    self.emit("node_status", {"node_id": n.id, "status": "OFFLINE"})
            n.offline = offline
            if n.level == "SAFE" and not offline and int(n.total_s) % 60 == 0:
                self.cls["NORMAL"] += 1
        if self.sync["state"] == "SYNCING" and time.time() - self.sync["last_buffered_ts"] > 4:
            self.sync.update(state="SYNC COMPLETE", synced=self.sync["synced"] + self.sync["buffered"], buffered=0)
            self.emit("network_status", {"sync": self.sync})
        self._routes()
        if int(now) % 5 == 0 and (not self.risk_hist or now - self.risk_hist[-1][0] > 4):
            act = [n for n in self.nodes.values() if not getattr(n, "offline", True)]
            self.risk_hist.append((now, max([n.risk for n in act], default=0), len(act)))
        self.store.flush()

    def _routes(self):
        sl = self.sector_levels()
        hot = set()
        for i in self.incidents.values():
            if i["status"] != "RESOLVED":
                nd = self.nodes.get(i["node_id"])
                if nd: hot.add(nd.meta["gallery"])
        for s in M.SECTORS:
            r = M.compute_route(s, sl, self.vent, hot)
            sig = ">".join(r.get("galleries", ["none"]))
            if s in self.route_sig and self.route_sig[s] != sig:
                self.route_changes += 1
                self.emit("route_update", {"sector": s, "route": sig})
                if self.scenario: self.scenario.mark("route", "SAFE ROUTE UPDATED")
            self.route_sig[s] = sig; self.routes[s] = r

    def active_nodes(self):
        return [n for n in self.nodes.values() if not getattr(n, "offline", True)]

    def sector_levels(self):
        out = {}
        for s in M.SECTORS:
            lv = "SAFE"
            for n in self.nodes.values():
                if n.meta["sector"] == s and not getattr(n, "offline", True) and M.RANK.get(n.level, 0) > M.RANK[lv] and n.level != "UNKNOWN":
                    lv = n.level
            out[s] = lv
        return out
