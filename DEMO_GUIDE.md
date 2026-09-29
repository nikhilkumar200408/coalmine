# SAMADHAAN v6 — DEMO_GUIDE

> Prototype early-warning / decision-support platform. **Not a certified structural-safety instrument.**
> Real hardware and simulation are always visibly separated (badges: REAL · SIMULATION · ESTIMATED · UNAVAILABLE).

## 0. Separate dashboards
- `/engineer` and `/government` share one staff header with a Government/Engineer switcher (internal use).
- `/worker` and `/resident` are standalone pages with no staff controls — open directly, share as a link, or scan a node's QR code. Each opens its own connection to the backend.

## USB hardware — the only real-data path in this build
Real telemetry is fed **exclusively over USB** (`ENABLE_WIFI = false` in the firmware). Flash the `.ino`, run `serial_bridge.py`, and the node's readings appear under Engineer → Nodes & detail with a REAL badge. Wi-Fi code exists in the firmware but is inert unless you explicitly re-enable it.

## Scanning a node's QR code from a phone
The QR encodes `window.location.origin`. If you open the dashboard as `localhost:5173`, the code will not resolve on a phone. Instead, open the dashboard using your computer's LAN IP (e.g. `http://192.168.1.23:5173`) — run Vite with `--host` (already the default here) — then the QR/"Copy link" will work from another device on the same network.

## 0. One-time setup
```bash
# terminal 1 – backend
cd backend && pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000
# terminal 2 – dashboard
cd frontend && npm install && npm run dev            # http://localhost:5173
# terminal 3 – USB bridge (only if using USB; auto-detects the port)
pip install pyserial requests && python3 serial_bridge.py
```
Flash `firmware_samadhaan_node.ino` (set `ENABLE_WIFI` and the `DHT_CONNECTED / SOUND_CONNECTED / STRAIN_CONNECTED` flags to match what is physically wired).

## 1. Connectivity
| Mode | Flow | Notes |
|---|---|---|
| **USB** | ESP32 → USB → `serial_bridge.py` → FastAPI → WebSocket → dashboard | no source edits: port auto-detected (`/dev/cu.*`, `/dev/ttyUSB*|ttyACM*`, `COM*`), picker if several; `--port` optional |
| **Wi-Fi** | ESP32 → HTTP POST `/api/v1/telemetry/esp32` → FastAPI → WebSocket → dashboard | set `ENABLE_WIFI=true`, SSID/password and `backendUrl` in the sketch |
| **Failover** | both may run; packets carry a `sequence` so a duplicate arriving over both transports is dropped | the active transport is the most recent one shown on the node |
| **Offline** | bridge spools packets to `bridge_spool.jsonl` when the backend is unreachable, replays them in order (`buffered:true`, original timestamps) | dashboard: `SYNCING` → `SYNC COMPLETE` |

## 2. The 2-minute evaluator demo
1. **Connect ESP32** – header shows `Real NODE-01: CONNECTED (USB-Serial)`; NODE-01 card is badged **REAL**. Disconnected sensors (strain, sound, DHT if unwired) read **NOT CONNECTED** — never an invented number.
2. **Show real telemetry** – Engineer → *Command*: NODE-01 SAFE, *WHY 0?* panel lists each evidence source; *Nodes & detail → Sensor health* shows MPU6050 HEALTHY and others NOT CONNECTED.
3. **Run false-alarm** – *Scenario Lab → RUN FALSE ALARM* (DEMO A): vibration ↑, tilt & strain normal → **TEMPORARY ANOMALY → NO SUBSIDENCE ALERT**; timeline shows `TRANSIENT DISTURBANCE REJECTED`.
4. **No false subsidence alert** – Analytics → *Event classification* counts it under TEMPORARY DISTURBANCE; Incidents stays empty.
5. **Run progressive subsidence** – *RUN SUBSIDENCE* (DEMO B, ~60 s). Purple banner: `SIMULATION — NOT LIVE MINE TELEMETRY`; real NODE-01 keeps streaming independently.
6. **Explainable risk** – *WHY nn?* : tilt/strain/persistence/trend/vibration contributions add up; press *Explain risk*.
7. **Digital twin** – node colours, heatmap and (Cross-section tab) surface profile respond to the same scenario state.
8. **Worker alert** – switch to **Worker** (pick Sector B/A): `MOVE TO SAFE ZONE`/`EVACUATE SECTOR` + "Recommended evacuation route — engineer confirmation required".
9. **Safe route** – route steps, distance, walking time and *why this route* (blocked sections listed); Twin shows the green animated route.
10. **Disconnect network** – run *RUN NETWORK FAILURE* (DEMO C) *or* unplug/stop the backend while the bridge runs.
11. **Offline buffering** – banner `OFFLINE MODE — telemetry buffering locally (N packets)`; (bridge: `backend unreachable -> buffered locally`).
12. **Reconnect → synchronisation** – `CONNECTION RESTORED — SYNCING` → `SYNC COMPLETE` (Scenario Lab + System health).
Other demos: *RUN NODE FAILURE* (node goes OFFLINE, neighbours continue, confidence drops), *RUN MASS INCIDENT* (multi-node, ventilation FAILED, route recalculated, several incidents). **RESET** restores demo state and never deletes real telemetry history.

## 3. Sensor-failure honesty check
Scenario Lab → *Sensor failure* (MPU6050 OFF at 40 %): the node shows **LIMITED ASSESSMENT — DATA CONFIDENCE DEGRADED**, never SAFE.

## 4. REAL vs SIMULATED vs ESTIMATED vs UNAVAILABLE
| Item | Status |
|---|---|
| NODE-01 pitch/roll/deviation, sound (if wired), RSSI, link mode, uptime, firmware | **REAL** (from ESP32) |
| NODE-01 temperature/humidity | **REAL** only if DHT is wired and read; else **UNAVAILABLE** |
| NODE-01 strain/flex, battery (until wired) | **UNAVAILABLE** |
| NODE-02…08, all scenario telemetry, worker counts, worker location, ventilation | **SIMULATION / MODELLED** (demo configuration) |
| Mine geometry, node coordinates, other mines in Government view | **DEMO CONFIG** (illustrative, not surveyed) |
| Risk score, confidence, deformation index, heatmaps, surface profile, trend projection | **ESTIMATED** (derived mathematically) |
| History graphs | **OBSERVED** (stored telemetry) |
| LoRa links | never shown — no LoRa telemetry exists |

## 5. Testing checklist
- [ ] USB: ESP32 → bridge → backend → dashboard shows REAL NODE-01
- [ ] Wi-Fi: `ENABLE_WIFI=true` posts arrive; RSSI shown
- [ ] Kill/restart backend: dashboard shows *Backend offline*, auto-reconnects (exponential backoff); bridge buffers then `SYNC`
- [ ] Unplug ESP32: NODE-01 → OFFLINE ("Last received n s ago"); replug → RECOVERED event
- [ ] Disconnect MPU6050: LIMITED ASSESSMENT (not SAFE)
- [ ] DEMO A–E each run deterministically; RESET returns to nominal
- [ ] Incident lifecycle: ACKNOWLEDGE → ASSIGN → INVESTIGATE → RESOLVE, action log recorded
- [ ] Calibrate node (keep stationary) → baseline saved; baseline survives restart
- [ ] Baseline learning FROZEN during CAUTION/HIGH, active scenario, sensor fault
- [ ] Worker + Resident views on a phone (responsive)
- [ ] Scenario report: Export PDF / JSON
