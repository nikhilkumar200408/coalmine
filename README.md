# SAMADHAAN

**Mine Subsidence Monitoring & Early Warning System**

**Smart India Hackathon 2026 · Problem Statement SIH26025**

SAMADHAAN is a hardware + software prototype for monitoring mine-related ground movement and sensor conditions. The current prototype combines an ESP32 sensing node, a local telemetry path and a web dashboard for monitoring, controlled testing and scenario analysis.

## Prototype

### Hardware Node

![SAMADHAAN hardware prototype](20260928_150040.jpg)

The physical node is built around an ESP32-C3 with an OLED display and MPU6050. In the current validated build, MPU6050 motion telemetry is the confirmed physical sensing path. Other sensor interfaces are present in the prototype/firmware, but they are not claimed as validated unless the corresponding sensor is physically connected and reporting.

### Monitoring Dashboard

![SAMADHAAN monitoring dashboard](WhatsApp%20Image%202026-09-29%20at%202.14.30%20PM.jpeg)

The dashboard shows node status, sensor values, monitored locations, incidents and the current risk state. Controlled scenario data is clearly separated from physical-node telemetry.

### Scenario Lab / Digital Twin

![SAMADHAAN Scenario Lab](WhatsApp%20Image%202026-09-29%20at%202.13.07%20PM.jpeg)

The Scenario Lab is used to test different sensor conditions without waiting for a real mine event. The Digital Twin view is a visual representation for controlled testing; the displayed mine geometry is not surveyed mine data.

## Current Prototype Status

### Working in the current prototype

- ESP32-C3 sensing node
- OLED local status display
- MPU6050-based motion sensing
- Physical-node telemetry to the dashboard over USB serial
- FastAPI backend and WebSocket telemetry
- React monitoring dashboard
- Explainable sensor-based risk scoring
- Controlled scenario testing
- Map, trends, node health and risk visualisation
- Controlled scenario data clearly separated from physical-node telemetry

### Proposed for field deployment

- Distributed multi-node surface deployment
- LoRa-based communication between surface nodes and a gateway
- Cellular/4G backhaul from the gateway
- Long-duration local buffering and cloud synchronisation
- Mine-site calibrated ML anomaly detection and temporal prediction
- Validation against the mine's existing survey measurements
- Rugged outdoor enclosure and field power system

This separation is intentional: the current prototype is used to validate the sensing, telemetry and decision-support workflow, while the field architecture describes the intended scalable deployment.

## Main Parts

- ESP32-C3 sensing node
- OLED display for local status
- MPU6050 motion sensing and sensor interfaces
- FastAPI backend for telemetry and WebSocket updates
- React dashboard for monitoring
- Serial bridge for connecting the physical node to the backend
- Scenario Lab for controlled test cases
- Explainable risk scoring using sensor deviation, persistence, trend and data confidence

## Architecture

### Current validated prototype

```text
ESP32-C3
   │
   │ USB Serial
   ▼
serial_bridge.py
   │
   ▼
FastAPI Backend
   │
   ├── Telemetry / Risk processing
   │
   └── WebSocket
          │
          ▼
    React Dashboard
```

**Validated now:** ESP32-C3 → USB Serial → `serial_bridge.py` → FastAPI → WebSocket → React Dashboard.

The firmware also contains an optional Wi-Fi path, but Wi-Fi is disabled in the current validated configuration. **LoRa, gateway and 4G/cellular are proposed field-deployment layers, not claimed as implemented in the current prototype.**

### Proposed field architecture

```text
Distributed Surface Sensor Nodes
             │
             ▼
      LoRa / Wireless Network
             │
             ▼
           Gateway
             │
             ▼
        4G / Internet
             │
             ▼
   Central Monitoring Platform
             │
       ┌─────┴─────┐
       ▼           ▼
   GIS / Risk   Alerts / Analysis
```

The LoRa, gateway and cellular layers are part of the proposed field architecture and are not presented as the currently validated physical communication path.

## How it works

1. The surface node measures available motion/deformation-related signals.
2. The current prototype sends physical-node telemetry through USB serial to the backend.
3. The backend processes telemetry and provides live updates to the dashboard.
4. The current risk layer combines available sensor deviation and temporal evidence into an explainable prototype score. It is not presented as a trained mine-site ML prediction model.
5. Controlled scenarios allow engineers to test increasing deformation, vibration, network loss and other conditions.
6. A future field deployment can extend the same workflow to distributed nodes, wireless communication and mine-site calibrated anomaly detection.

A single abnormal reading is not intended to be treated as a confirmed subsidence event. Persistence, trend and agreement between multiple observations can be used to increase confidence and reduce false alarms.

## AI / Anomaly Detection

The current prototype focuses on explainable sensor-based risk scoring and controlled scenario validation. A production anomaly-detection layer can use mine-site time-series data for model training and validation, including temporal models and unsupervised anomaly detection.

We do not treat synthetic scenario results as a substitute for field-trained safety models. Site calibration and comparison with existing mine survey measurements would be required before operational use.

## Run Locally

Requirements: Python 3, Node.js and npm.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite. When the backend is running, its API documentation is available at `http://127.0.0.1:8000/docs`.

## Connecting the ESP32

Flash [`firmware_samadhaan_node.ino`](firmware_samadhaan_node.ino) to the ESP32 and connect the board over USB.

From the repository root:

```bash
pip install pyserial requests
python3 serial_bridge.py
```

The bridge detects available serial devices and reconnects if the connection is interrupted. Sensor connection flags in the firmware should match the hardware that is actually connected.

## Project Files

- [`firmware_samadhaan_node.ino`](firmware_samadhaan_node.ino) — ESP32 firmware
- [`serial_bridge.py`](serial_bridge.py) — USB serial bridge
- [`backend/`](backend/) — API, telemetry and processing
- [`frontend/`](frontend/) — React dashboard
- [`EVALUATION_GUIDE.md`](EVALUATION_GUIDE.md) — evaluation steps and controlled test cases
- [`API.md`](API.md) — API and WebSocket details

## Public Monitoring Console

The public console can be opened without the backend. Use the scenario controls to change sensor conditions and observe the corresponding risk, map, charts and subsurface visualisations.

- Public console: `/`
- Source code: https://github.com/nikhilkumar200408/coalmine
- Scenario values are simulated and clearly labelled; they are not live mine measurements.

## Notes

The project contains both physical-node data and controlled scenario data. These are kept separate in the application where applicable. Risk values, forecasts and digital-twin views are intended for prototype evaluation and should not be treated as engineering or operational safety decisions.

The current system is a student engineering prototype, not a certified structural-safety instrument. Field deployment would require site-specific calibration, ruggedisation, reliable communications, long-duration testing and validation against established mine-survey measurements.

## Validation & Evidence

For a clear separation between demonstrated functionality and deployment-stage extensions, see [VALIDATION.md](VALIDATION.md). Project evidence is listed in [evidence/README.md](evidence/README.md).

The repository deliberately avoids presenting proposed LoRa/4G communication or mine-site-trained ML as already validated hardware/software. This keeps the public implementation claims aligned with the current prototype.
