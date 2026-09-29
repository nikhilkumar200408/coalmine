# SAMADHAAN v6 API (FastAPI, docs at `/docs`)
Legacy v5 endpoints are unchanged: `POST /api/v1/telemetry/esp32` (`/sensor-data`), `WS /ws/telemetry`, `GET /history /stats /api/v1/ai-summary /api/v1/projection /api/v1/evacuation-log`, `GET|POST /api/v1/nodes`.
If `SAMADHAAN_ADMIN_TOKEN` is set, mutating endpoints require header `X-Admin-Token` (the UI reads `localStorage.samadhaan_admin`). CORS: `SAMADHAAN_CORS`. DB: `SAMADHAAN_DB` (SQLite).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/dashboard/summary` | full platform state (same object pushed on WS as `state`) |
| GET | `/api/v1/nodes`, `/nodes/{id}` | node views (legacy registry keys `node_id/lat/lng` kept) |
| GET | `/api/v1/nodes/{id}/history?range=1m|10m|1h|1d|custom&start&end` | OBSERVED history |
| GET | `/api/v1/nodes/{id}/health` | per-sensor health, quality states, reliability |
| GET | `/api/v1/risk/{id}` | explainable risk: contributions, confidence, notes, weights, thresholds |
| GET | `/api/v1/baselines/{id}` · POST `/api/v1/nodes/{id}/calibrate` | per-node self-learned baseline / calibration |
| GET | `/api/v1/incidents` · POST `/incidents/{id}/acknowledge|assign|investigate|resolve` | incident centre |
| GET | `/api/v1/alerts` · POST `/alerts/{id}/acknowledge` | derived alerts |
| GET | `/api/v1/analytics?range=1H|6H|24H|7D` · `/network` · `/system-health` · `/digital-twin?layer&window` · `/routes` · `/mine` | views |
| POST | `/api/v1/scenarios` (create) · `/{id}/run` · `/{id}/stop` · GET `/{id}/state` · `/{id}/report` | Scenario Lab |
| POST | `/api/v1/scenarios/run-demo/{A..E}` · `/api/v1/reset` · `/api/v1/demo {active}` | one-click demos / reset / demo mode |
| POST/GET | `/api/v1/bridge/status` | serial bridge status (port, baud, pkts/s, buffered) |

**WebSocket events:** `state`, `telemetry` (REAL only, legacy shape + `risk_level/confidence/decision`), `risk_update`, `node_status`, `incident_created`, `incident_updated`, `network_status`, `scenario_started`, `scenario_tick`, `scenario_finished`, `system_health`, `baseline_updated`, `sensor_fault`, `route_update`.

**Telemetry schema (all optional except `node_id`)**: `sequence, pitch, roll, pitch_dev, roll_dev, strain, strain_dev, sound|vibration, temp|temperature, humidity, battery_pct, battery_sensing_ok, rssi, link_mode, power_source, firmware_version, uptime, calibration_status` + availability flags `mpu_available, strain_available, sound_available, temp_available, hum_available`. `null` / `*_available:false` ⇒ shown as NOT CONNECTED — never fabricated.

**Risk model** (`samadhaan/config.py`, env-overridable): score = tilt(30) + strain(30) + persistence(20) + trend(10) + vibration-confirmation(10). Vibration only counts when tilt or strain also deviate. Levels SAFE<35≤CAUTION<60≤HIGH<85≤CRITICAL — *prototype decision thresholds, not certified limits*.
