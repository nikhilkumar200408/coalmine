# SAMADHAAN

**AI-Enabled Low-Cost Real-Time Mine Subsidence Monitoring & Early Warning System**

**Smart India Hackathon 2026 · Problem Statement SIH26025**

SAMADHAAN brings ESP32 telemetry, scenario simulation, and mine operations views into one platform. It is a research and demonstration prototype, not a certified safety system.

## Working Prototype

### Physical Hardware Node

![SAMADHAAN physical hardware prototype](20260928_150040.jpg)

The prototype node demonstrates the physical sensing and edge-monitoring layer built around the ESP32, OLED, MPU6050 and connected deformation/interaction sensing hardware.

### Live Monitoring Dashboard

![SAMADHAAN live monitoring dashboard](WhatsApp%20Image%202026-09-29%20at%202.14.30%20PM.jpeg)

The dashboard provides mine-level monitoring, node status, incident visibility, risk state and operational views. Values or incidents marked as simulation/estimated are intentionally distinguished from live telemetry.

### Scenario Lab & Digital Twin

![SAMADHAAN Scenario Lab and Digital Twin](WhatsApp%20Image%202026-09-29%20at%202.13.07%20PM.jpeg)

Scenario Lab runs controlled demonstrations through the same processing pipeline, while the Digital Twin view presents illustrative mine geometry, node state, risk and route information.

## Highlights

- Role-specific dashboards for engineers, government teams, workers, and residents.
- FastAPI service for sensor ingestion, live WebSocket updates, incident workflows, and persisted telemetry.
- Explainable risk scoring that combines sensor evidence, data confidence, and node health.
- Digital-twin views, safe-route recommendations, and a Scenario Lab for controlled demonstrations.
- USB serial bridge with device discovery, reconnect handling, and local buffering when the backend is unavailable.
- ESP32 firmware that reports sensor availability instead of presenting unwired sensors as live readings.

## Architecture

```text
ESP32 ── USB ── serial_bridge.py ──┐
                                   ├── FastAPI ── WebSocket ── React dashboard
Scenario Lab ──────────────────────┘
```

The firmware also contains an optional Wi-Fi path. USB is the default hardware workflow in this repository. Simulated events and estimated values are identified separately from real telemetry in the application.

## Run Locally

Requirements: Python 3, Node.js, and npm.

Start the backend in one terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Start the dashboard in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. The backend API documentation is available at `http://127.0.0.1:8000/docs` while the service is running.

## Connect an ESP32

Flash [`firmware_samadhaan_node.ino`](firmware_samadhaan_node.ino) to the board, connect it over USB, then run the bridge from the repository root with the backend environment active:

```bash
pip install pyserial requests
python3 serial_bridge.py
```

If more than one serial device is available, select the ESP32 when prompted. A port can also be supplied explicitly, for example `python3 serial_bridge.py --port /dev/cu.usbmodemXXXX` on macOS. Set the firmware's sensor-connection flags to match the hardware actually installed.

## Project Guide

- [DEMO_GUIDE.md](DEMO_GUIDE.md): dashboard flows, scenarios, hardware checks, and a real-versus-simulated data guide.
- [API.md](API.md): HTTP and WebSocket endpoints.
- [`backend/samadhaan/`](backend/samadhaan/): telemetry processing, risk engine, simulation, persistence, and view-state assembly.
- [`frontend/src/`](frontend/src/): React dashboards, components, and telemetry hooks.

