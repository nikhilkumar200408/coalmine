# SAMADHAAN Validation & Claim Boundary

This document records what the current repository is intended to demonstrate and what remains a field-deployment extension.

## 1. Current implementation boundary

| Capability | Current status | Evidence / note |
|---|---|---|
| ESP32-C3 node | IMPLEMENTED | Physical prototype |
| OLED local display | IMPLEMENTED | Physical prototype |
| MPU6050 motion sensing | IMPLEMENTED | Current validated physical sensing path |
| USB serial telemetry | IMPLEMENTED | ESP32 → serial bridge |
| `serial_bridge.py` | IMPLEMENTED | Serial-to-backend bridge |
| FastAPI telemetry backend | IMPLEMENTED | Repository backend |
| WebSocket live updates | IMPLEMENTED | Backend → dashboard |
| React monitoring dashboard | IMPLEMENTED | Repository frontend |
| Explainable prototype risk score | IMPLEMENTED | Decision-support prototype logic |
| Controlled scenario testing | IMPLEMENTED | Scenario Lab |
| Map / trends / node-health views | IMPLEMENTED | Dashboard views |
| DHT11 physical telemetry | NOT VALIDATED | Sensor is not physically connected in the current build |
| Sound sensor physical telemetry | NOT VALIDATED | Sensor is not physically connected in the current build |
| Flex / strain telemetry | NOT VALIDATED | Not implemented/validated in the current firmware |
| LoRa node-to-gateway link | PROPOSED | Field-deployment architecture |
| Gateway | PROPOSED | Field-deployment architecture |
| 4G / cellular backhaul | PROPOSED | Field-deployment architecture |
| Mine-site-trained ML prediction | NEXT STAGE | Requires representative field time-series data |
| Mine-survey correlation | NEXT STAGE | Requires comparison with established survey measurements |
| Rugged field enclosure | NEXT STAGE | Required for deployment outside the bench prototype |

## 2. Evidence already present in the repository

The repository contains the following real project evidence:

- `20260928_150040.jpg` — physical SAMADHAAN node
- `WhatsApp Image 2026-09-29 at 2.14.30 PM.jpeg` — monitoring dashboard
- `WhatsApp Image 2026-09-29 at 2.13.07 PM.jpeg` — Scenario Lab / controlled testing view

These are project evidence images, not stock or generated architecture images.

## 3. Calibration record

Do not publish accuracy percentages unless they were actually measured.

| Test angle | Reference angle | Node reading | Absolute error |
|---:|---:|---:|---:|
| 0° | 0° | — | — |
| 5° | 5° | — | — |
| 10° | 10° | — | — |
| 15° | 15° | — | — |
| 20° | 20° | — | — |
| 25° | 25° | — | — |
| 30° | 30° | — | — |

A suitable bench method is to place the node on a stable reference surface, set known inclinations, record several readings at each point, and report mean error and repeatability. Replace the dashes only with measurements actually obtained.

## 4. False-alarm / persistence validation plan

A useful controlled test is to compare:

1. **Short disturbance:** brief vibration or movement followed by a return to baseline.
2. **Persistent deformation:** sustained change in tilt/deformation over multiple observations.
3. **Scenario-only fault:** controlled sensor/network fault in Scenario Lab.

The expected design behaviour is that a single transient observation should not be treated as proof of subsidence; persistence, trend and corroborating evidence should increase confidence.

This document records the validation method, not fabricated test results.

## 5. Prototype vs deployment

The current prototype demonstrates the sensing-to-dashboard decision-support workflow. A field system would require site-specific calibration, ruggedisation, reliable communications, longer-duration testing, mine-survey comparison and appropriate safety validation before operational use.