# SAMADHAAN Evaluation Guide

> Prototype early-warning and decision-support platform. Not a certified structural-safety instrument.
>
> Real hardware telemetry and controlled scenario data are kept visibly separate.

## 1. Current physical-node path

The validated physical communication path in the current build is:

ESP32 → USB Serial → `serial_bridge.py` → FastAPI → WebSocket → Dashboard

The current repository does not present LoRa or cellular communication as validated hardware.

## 2. Quick evaluation flow

1. Connect the ESP32 and show the physical node status.
2. Show real NODE-01 telemetry on the dashboard.
3. Open Scenario Lab and run a controlled false-alarm condition.
4. Show how the risk state changes when abnormal conditions persist.
5. Explain that scenario values are simulated and are not live mine measurements.
6. Show the map, trends, node health and risk explanation.
7. Disconnect the backend or communication path to inspect the local/offline behaviour where configured.
8. Reset the scenario and return to the nominal state.

## 3. REAL vs SIMULATED vs ESTIMATED

| Item | Status |
|---|---|
| Physical ESP32 telemetry | REAL when the node is connected |
| Sensor values from unwired sensors | UNAVAILABLE |
| Scenario Lab telemetry | SIMULATED / CONTROLLED |
| Risk score | ESTIMATED prototype score |
| Map geometry and illustrative boundaries | ILLUSTRATIVE |
| Mine-site survey measurements | NOT CONNECTED |
| Multi-node field network | PROPOSED |
| LoRa / gateway / 4G field communication | PROPOSED |

## 4. What is implemented

- ESP32-C3 sensing node
- OLED local status
- MPU6050-based motion sensing
- USB serial telemetry
- FastAPI backend and WebSocket updates
- React monitoring dashboard
- Explainable sensor-based risk scoring
- Controlled scenario testing
- Map and temporal visualisation

## 5. What is proposed for field deployment

- Distributed surface nodes
- LoRa-based node-to-gateway communication
- Cellular/4G gateway backhaul
- Mine-site calibration and long-duration validation
- Field-trained anomaly detection and temporal prediction
- Rugged enclosure and field power system
- Validation against established mine survey measurements

## 6. Evaluation note

The controlled scenarios are intended to test system behaviour and alert logic before field deployment. They are not evidence of mine-site model accuracy. Operational deployment would require site-specific calibration, independent engineering validation and appropriate mine-safety approval.
