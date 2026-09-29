"""Deterministic Scenario Lab engine. It generates COHERENT synthetic telemetry (tilt, strain, vibration,
comms, sensor faults, ventilation, workers) and feeds it through the SAME Platform.ingest() pipeline used for
real ESP32 data, tagged source=SIMULATION. Nothing here ever touches the REAL node."""
import random, time, zlib, uuid
from . import mine as M, config as C

DEFAULTS = dict(name="Custom scenario", node="NODE-03", nodes=None, duration=60, tilt=0.0, strain=0.0,
                vibration="normal", temp_delta=0.0, comm="ON", sensor_fail=None, workers=126,
                ventilation="NORMAL", speed="medium", fail_node=None)
PRESETS = {
    "normal": dict(name="Normal operation", duration=30),
    "machinery": dict(name="Machinery vibration", duration=40, vibration="machinery"),
    "impact": dict(name="Sudden impact", duration=30, vibration="spike"),
    "gradual": dict(name="Gradual subsidence", duration=90, tilt=8, strain=20, vibration="rising", speed="slow", temp_delta=1.5),
    "rapid": dict(name="Rapid deformation", duration=45, tilt=10, strain=25, vibration="rising", speed="rapid"),
    "sensor_failure": dict(name="Sensor failure", duration=45, tilt=5, strain=12, sensor_fail="MPU6050"),
    "comm_failure": dict(name="Communication failure", duration=50, tilt=0, strain=0, comm="OFF"),
    "multi_node": dict(name="Multiple-node anomaly", duration=60, tilt=7, strain=16, vibration="rising", nodes=["NODE-03", "NODE-05", "NODE-04"]),
    "ventilation": dict(name="Ventilation failure", duration=45, ventilation="FAILED", tilt=3, strain=6),
    "combined": dict(name="Combined disaster", duration=60, tilt=9, strain=22, vibration="rising", speed="rapid", nodes=["NODE-03", "NODE-05", "NODE-04", "NODE-02"], ventilation="FAILED", comm="OFF", workers=120),
    # one-click evaluator demos
    "false_alarm": dict(name="DEMO A - False alarm rejection", duration=40, vibration="spike", tilt=0, strain=0),
    "progressive": dict(name="DEMO B - Progressive subsidence", duration=60, tilt=8, strain=20, vibration="rising", speed="medium", node="NODE-03"),
    "network_failure": dict(name="DEMO C - Network failure", duration=50, tilt=3, strain=6, comm="OFF"),
    "node_failure": dict(name="DEMO D - Node failure", duration=45, tilt=7, strain=17, fail_node="NODE-05", nodes=["NODE-03", "NODE-04"]),
    "mass_incident": dict(name="DEMO E - Mass incident", duration=60, tilt=9, strain=22, vibration="rising", speed="rapid",
                          nodes=["NODE-03", "NODE-05", "NODE-04", "NODE-02"], ventilation="FAILED", workers=120),
}
DEMO_KEYS = {"A": "false_alarm", "B": "progressive", "C": "network_failure", "D": "node_failure", "E": "mass_incident"}
RECOVERY_S = 10
PRE = 0.15

def ramp(p, speed):
    k = {"slow": 1.6, "medium": 1.2, "rapid": 0.7}.get(speed, 1.2)
    return 0.0 if p <= PRE else min(1.0, ((p - PRE) / (1 - PRE)) ** k)

class ScenarioEngine:
    def __init__(self, platform):
        self.p = platform; platform.scenario = self
        self.defs = {}; self.cur = None; self.idle_rng = random.Random(7); self.ticks = 0

    # ---- lifecycle ----
    def create(self, params):
        params = dict(params or {}); preset = params.pop("preset", None)
        d = dict(DEFAULTS); d.update(PRESETS.get(preset, {})); d.update({k: v for k, v in params.items() if v is not None})
        d["duration"] = int(max(10, min(600, d["duration"]))); d["preset"] = preset
        if d["node"] not in self.p.nodes or self.p.nodes[d["node"]].source != "SIMULATION":
            d["node"] = "NODE-03"          # REAL node can never be simulated
        d["nodes"] = [n for n in (d["nodes"] or [d["node"]]) if n in self.p.nodes and self.p.nodes[n].source == "SIMULATION"] or [d["node"]]
        d["id"] = "SCN-" + uuid.uuid4().hex[:6].upper()
        self.defs[d["id"]] = d
        return d

    def run(self, sid):
        d = self.defs.get(sid)
        if not d:
            return None
        self.reset(quiet=True)
        self.p.demo.update(active=True, scenario_id=sid)
        self._prewarm()
        rng = random.Random(zlib.crc32(sid.encode()))
        self.cur = dict(def_=d, id=sid, state="RUNNING", t=-1, rng=rng, timeline=[], marks=set(), buf=[], outage=False,
                        started=time.time(), peak=0, peak_nodes={}, events_at_start=len(self.p.class_log), route_changes0=self.p.route_changes,
                        cls0=dict(self.p.cls), inc0=set(self.p.incidents), report=None, warm=self._warm())
        for nid in d["nodes"]:
            self.p.nodes[nid].sim_frozen = True
        self.p.emit("scenario_started", {"scenario": self.public(self.cur)})
        return self.public(self.cur)

    def _prewarm(self):
        """Let each SIMULATED node learn its own baseline from a stable idle period (back-dated), so demos start instantly."""
        now = time.time(); W = C.BASELINE_WARMUP + 2
        for k in range(W):
            for n in self.p.nodes.values():
                if n.source == "SIMULATION" and n.base.get("pitch", {}).get("n", 0) < C.BASELINE_WARMUP:
                    self.p.ingest(dict(self._idle(n, self.idle_rng, 0), sequence=-1000 - k), "SIMULATION", ts=now - (W - k))

    def _warm(self):
        return all(n.base.get("pitch", {}).get("n", 0) >= C.BASELINE_WARMUP for n in self.p.nodes.values() if n.source == "SIMULATION")

    def stop(self):
        if self.cur and self.cur["state"] == "RUNNING":
            self._finish(stopped=True)

    def reset(self, quiet=False):
        """Stop scenario, restore demo state. NEVER deletes real telemetry history."""
        p = self.p
        if self.cur and self.cur["state"] == "RUNNING":
            self._flush_buffer()
        for n in p.nodes.values():
            if n.source == "SIMULATION":
                n.sim_frozen = False; n.persist = 0.0; n.transient = None
        for iid, inc in list(p.incidents.items()):
            if inc["source"] == "SIMULATION" and inc["status"] != "RESOLVED":
                inc["status"] = "RESOLVED"; inc["resolution_note"] = "auto-resolved by scenario reset"
                inc["actions"].append({"ts": time.time(), "action": "RESOLVE", "by": "system", "note": "scenario reset"}); p.store.upsert("incidents", iid, inc)
        p.vent = {s: "NORMAL" for s in M.SECTORS}; p.workers = {s: v["workers"] for s, v in M.SECTORS.items()}
        p.pipeline_offline = False; p.acked_alerts.clear()
        p.demo["scenario_id"] = None
        if self.cur and self.cur["state"] == "RUNNING":
            self.cur["state"] = "STOPPED"
        if not quiet:
            p.demo["active"] = False if not self.cur else p.demo["active"]
            p.emit("scenario_finished", {"reset": True})

    # ---- generation ----
    def _idle(self, n, rng, t):
        i = int(n.id[-2:])
        return {"node_id": n.id, "pitch": 1.0 + 0.3 * i % 1.5, "roll": 0.5 + 0.2 * (i % 3), "strain_dev": rng.uniform(-0.4, 0.4),
                "vibration": 5 + rng.uniform(-1.2, 1.2), "temperature": 31 + rng.uniform(-.15, .15) + 0.01 * i, "humidity": 82 + rng.uniform(-.4, .4),
                "battery_pct": max(20, 87 - self.ticks * 0.002), "link_mode": "SIM-MESH", "rssi": -60 - i, "power_source": "Battery",
                "sequence": self.ticks, "firmware_version": "sim", "uptime": self.ticks, "sound_available": True, "strain_available": True}

    def _gen(self, n, c, t):
        d, rng = c["def_"], c["rng"]; p = t / d["duration"]
        r = self._idle(n, rng, t)
        aff = n.id in d["nodes"]
        w = 1.0 if n.id == d["node"] else 0.7
        f = ramp(min(p, 1.0), d["speed"]) if t <= d["duration"] else ramp(1.0, d["speed"]) * max(0.0, 1 - (t - d["duration"]) / RECOVERY_S)
        if aff:
            r["pitch"] += d["tilt"] * f * w; r["roll"] += 0.5 * d["tilt"] * f * w
            r["strain_dev"] += d["strain"] * f * w; r["temperature"] += d["temp_delta"] * f
            v = d["vibration"]
            if v == "machinery": r["vibration"] += (16 if (t % 14) < 9 else 0) + rng.uniform(-2, 2)
            elif v == "spike": r["vibration"] += 30 if (6 <= t < 10 or 20 <= t < 23) else 0
            elif v == "rising": r["vibration"] += 24 * f * w
            elif v == "high": r["vibration"] += 30 if t >= 5 else 0
            if d["sensor_fail"] and p >= 0.4 and n.id == d["node"]:
                key = {"MPU6050": "mpu_available", "STRAIN": "strain_available", "SOUND": "sound_available"}.get(d["sensor_fail"])
                if key: r[key] = False
        return r

    # ---- tick (1 Hz) ----
    def step(self):
        p = self.p; self.ticks += 1
        if not p.demo["active"]:
            return
        c = self.cur
        running = c and c["state"] == "RUNNING"
        if running and not c["warm"]:                 # pre-roll: let each simulated node learn its own baseline
            c["warm"] = self._warm()
            for n in p.nodes.values():
                if n.source == "SIMULATION": p.ingest(self._idle(n, self.idle_rng, 0), "SIMULATION")
            return
        if running:
            c["t"] += 1
            t, d = c["t"], c["def_"]
            self._apply_env(c, t)
        for n in p.nodes.values():
            if n.source != "SIMULATION":
                continue
            if running and d["fail_node"] == n.id and t / d["duration"] >= 0.35:
                continue                               # failed node silent -> goes OFFLINE
            r = self._gen(n, c, t) if running else self._idle(n, self.idle_rng, 0)
            if running and c["outage"]:
                c["buf"].append((time.time(), r)); continue
            p.ingest(r, "SIMULATION")
        if running:
            self._observe(c, t)
            if t >= d["duration"] + RECOVERY_S:
                self._finish()

    def _apply_env(self, c, t):
        d, p = c["def_"], self.p; frac = t / d["duration"]
        sec = p.nodes[d["node"]].meta["sector"]
        if d["ventilation"] != "NORMAL" and 0.3 <= frac < 1.0 and p.vent[sec] != d["ventilation"]:
            for s in ([sec] + ([x for x in M.SECTORS if x != sec][:1] if d["ventilation"] == "FAILED" and len(d["nodes"]) > 2 else [])):
                p.vent[s] = d["ventilation"]
            self.mark("vent", f"VENTILATION {d['ventilation']} (modelled)")
        if frac >= 1.0 and d["ventilation"] != "NORMAL" and t > d["duration"] + 3:
            p.vent = {s: "NORMAL" for s in M.SECTORS}
        w = d["workers"]; p.workers = {"A": round(w * .38), "B": round(w * .36), "C": w - round(w * .38) - round(w * .36)} if d["workers"] != 126 or d["preset"] else p.workers
        if d["comm"] == "OFF":
            out = 0.3 <= frac < 0.6
            if out and not c["outage"]:
                c["outage"] = True; p.pipeline_offline = True; self.mark("comm", "COMMUNICATION LOST \u2014 LOCAL BUFFERING")
                p.emit("network_status", {"offline": True})
            elif not out and c["outage"]:
                self._flush_buffer(); self.mark("sync", "CONNECTION RESTORED \u2014 SYNCING")

    def _flush_buffer(self):
        c = self.cur
        if not c: return
        c["outage"] = False; self.p.pipeline_offline = False
        for ts, r in c["buf"]:
            r = dict(r, sequence=None); self.p.ingest(r, "SIMULATION", ts=ts, buffered=True)
        n = len(c["buf"]); c["buf"] = []
        self.p.emit("network_status", {"offline": False, "flushed": n})

    def mark(self, key, label):
        c = self.cur
        if not c or c["state"] != "RUNNING" or key in c["marks"]: return
        c["marks"].add(key); c["timeline"].append({"t": max(0, c["t"]), "key": key, "label": label})

    def _observe(self, c, t):
        p, d = self.p, c["def_"]
        if t == 0: self.mark("start", "NORMAL")
        tgt = p.nodes[d["node"]]
        if tgt.dev["strain"] > 3: self.mark("strain", "STRAIN INCREASE")
        if max(abs(tgt.dev["pitch"]), abs(tgt.dev["roll"])) > C.TILT_ACTIVE_DEG: self.mark("tilt", "TILT DEVIATION")
        if tgt.corr >= 2 and tgt.level != "UNKNOWN" and tgt.risk >= 20: self.mark("corr", "MULTI-SENSOR CORRELATION")
        if getattr(tgt, "last_transient", None) and tgt.last_transient.get("ended", 0) >= c["started"]:
            self.mark("transient", "TRANSIENT DISTURBANCE REJECTED \u2014 NO SUBSIDENCE ALERT")
        if not tgt.sensor_state.get("MPU6050", True): self.mark("fault", "SENSOR FAULT \u2014 DATA CONFIDENCE DEGRADED")
        if d["fail_node"] and getattr(p.nodes[d["fail_node"]], "offline", False): self.mark("nodefail", f"{d['fail_node']} OFFLINE \u2014 NEIGHBOURS CONTINUE")
        if any(M.RANK.get(p.nodes[x].level, 0) >= 2 for x in d["nodes"]): self.mark("high", "RISK = HIGH")
        if any(i["scenario_id"] == c["id"] for i in p.incidents.values()): self.mark("incident", "INCIDENT GENERATED")
        if any(M.RANK.get(l, 0) >= 2 for l in p.sector_levels().values()): self.mark("worker", "WORKER ALERT ISSUED")
        if p.sync["state"] == "SYNC COMPLETE" and "sync" in c["marks"]: self.mark("synced", "SYNC COMPLETE")
        for n in p.nodes.values():
            if n.source == "SIMULATION":
                c["peak_nodes"][n.id] = max(c["peak_nodes"].get(n.id, 0), n.risk)
        c["peak"] = max(c["peak_nodes"].values(), default=0)
        p.emit("scenario_tick", {"scenario_id": c["id"], "t": t, "peak": c["peak"]})

    def _finish(self, stopped=False):
        c, p = self.cur, self.p
        self._flush_buffer()
        c["state"] = "STOPPED" if stopped else "FINISHED"
        for n in p.nodes.values():
            n.sim_frozen = False
        inc = [i for i in p.incidents.values() if i["scenario_id"] == c["id"]]
        peak_lvl = next((l for t_, l in C.LEVELS if c["peak"] >= t_), "SAFE")
        c["report"] = {"scenario": c["def_"]["name"], "id": c["id"], "source": "SIMULATION", "duration_s": c["t"], "peak_risk": c["peak"], "peak_level": peak_lvl,
                       "nodes_affected": sorted(k for k, v in c["peak_nodes"].items() if v >= 35), "anomalies": [e for e in list(p.class_log)[c["events_at_start"] - len(p.class_log):] if e["source"] == "SIMULATION"][-12:],
                       "alerts_generated": [{"id": i["id"], "node": i["node_id"], "severity": i["severity"], "risk": i["peak_risk"]} for i in inc],
                       "response_timeline": c["timeline"], "route_changes": p.route_changes - c["route_changes0"],
                       "recovery": f"Sync state: {p.sync['state']}; ventilation {'restored' if all(v == 'NORMAL' for v in p.vent.values()) else 'still degraded'}",
                       "outcome": (f"{len(inc)} incident(s) raised; field verification required" if inc else
                                   ("NO SUBSIDENCE ALERT \u2014 disturbance rejected by multi-sensor correlation" if any(x["key"] == "transient" for x in c["timeline"]) else
                                    (f"Elevated risk observed ({peak_lvl}); no incident raised" if peak_lvl != "SAFE" else "No incident raised; system nominal"))),
                       "disclaimer": "SIMULATION DATA \u2014 not live mine telemetry"}
        p.store.upsert("scenarios", c["id"], {"id": c["id"], "def": c["def_"], "report": c["report"]})
        p.emit("scenario_finished", {"scenario_id": c["id"], "report": c["report"]})

    def public(self, c):
        if not c: return None
        return {"id": c["id"], "state": c["state"], "t": max(0, c["t"]), "duration": c["def_"]["duration"] + RECOVERY_S, "params": {k: v for k, v in c["def_"].items()},
                "timeline": c["timeline"], "warming_up": not c["warm"], "peak": c["peak"], "outage": c["outage"], "buffered": len(c["buf"]), "report": c["report"],
                "source": "SIMULATION"}
