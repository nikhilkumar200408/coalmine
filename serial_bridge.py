#!/usr/bin/env python3
"""
SAMADHAAN Serial-to-Backend Bridge (v6)
ESP32 --USB--> serial_bridge.py --HTTP--> FastAPI --WebSocket--> Dashboard

New in v6 (no source edits needed for any of it):
  * USB auto-detection (macOS /dev/cu.*, Linux /dev/ttyUSB*|ttyACM*, Windows COM*); asks you to pick if several
  * serial reconnect + backend retry with exponential backoff
  * OFFLINE BUFFER: if the backend is unreachable, packets are spooled to disk (JSONL) and replayed in order
    when it returns (marked buffered=true, original bridge_ts preserved -> dashboard shows SYNCING -> SYNC COMPLETE)
  * packets/sec, forwarded/error counters reported to the dashboard (/api/v1/bridge/status)
  * firmware `sequence` numbers pass through untouched so the backend can de-duplicate Wi-Fi vs USB copies

Usage:   pip install pyserial requests
         python3 serial_bridge.py                       # auto-detect
         python3 serial_bridge.py --port COM4 --baud 115200
Env:     SAMADHAAN_BACKEND=http://localhost:8000   SAMADHAAN_PORT=/dev/cu.usbserial-0001
"""
import argparse, collections, glob, json, os, sys, time
import requests, serial
from serial.tools import list_ports

BAUD = 115200
SPOOL = os.environ.get("SAMADHAAN_SPOOL", "bridge_spool.jsonl")

def find_ports():
    ports = [p.device for p in list_ports.comports()]
    ports += glob.glob("/dev/cu.usb*") + glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")
    seen, out = set(), []
    for p in ports:
        if p not in seen and "Bluetooth" not in p and "debug-console" not in p:
            seen.add(p); out.append(p)
    return out

def choose_port(arg):
    if arg: return arg
    ports = find_ports()
    if not ports: return None
    if len(ports) == 1: return ports[0]
    print("Multiple serial devices found:")
    for i, p in enumerate(ports): print(f"  [{i}] {p}")
    try: return ports[int(input("Select port number: ").strip() or 0)]
    except Exception: return ports[0]

class Spool:
    def __init__(self): self.n = sum(1 for _ in open(SPOOL)) if os.path.exists(SPOOL) else 0
    def add(self, payload):
        with open(SPOOL, "a") as f: f.write(json.dumps(payload) + "\n")
        self.n += 1
    def drain(self, post):
        if not self.n or not os.path.exists(SPOOL): return 0
        lines = open(SPOOL).read().splitlines(); sent = 0
        for i, ln in enumerate(lines):
            try: d = json.loads(ln); d["buffered"] = True
            except Exception: continue
            if not post(d):
                open(SPOOL, "w").write("\n".join(lines[i:]) + "\n"); self.n = len(lines) - i; return sent
            sent += 1
        os.remove(SPOOL); self.n = 0
        return sent

def main():
    ap = argparse.ArgumentParser(description="Bridge ESP32 USB telemetry to SAMADHAAN backend")
    ap.add_argument("--port", default=os.environ.get("SAMADHAAN_PORT")); ap.add_argument("--baud", type=int, default=BAUD)
    ap.add_argument("--backend", default=os.environ.get("SAMADHAAN_BACKEND", "http://localhost:8000"))
    a = ap.parse_args()
    base = a.backend.rstrip("/"); url = base + "/api/v1/telemetry/esp32"
    spool, st = Spool(), dict(forwarded=0, errors=0, backoff=1.0, last=0.0)
    times = collections.deque(maxlen=30); ser = None; port = None; last_status = 0

    def post(p):
        try: return requests.post(url, json=p, timeout=3).status_code == 200
        except requests.RequestException: return False

    def report(force=False):
        nonlocal last_status
        if not force and time.time() - last_status < 2: return
        last_status = time.time(); pps = (len(times) - 1) / (times[-1] - times[0]) if len(times) > 1 and times[-1] > times[0] else 0.0
        try: requests.post(base + "/api/v1/bridge/status", json=dict(connected=ser is not None and ser.is_open, port=port, baud=a.baud, packets_per_s=round(pps, 2), buffered=spool.n,
                           forwarded=st["forwarded"], errors=st["errors"], last_packet_age=round(time.time() - st["last"], 1) if st["last"] else None), timeout=1.5)
        except requests.RequestException: pass

    print("SAMADHAAN bridge -> " + url + "  (Ctrl+C to stop)")
    try:
        while True:
            if ser is None or not ser.is_open:
                port = choose_port(a.port) if ser is None or not a.port else a.port
                if not port:
                    print(f"No serial device found - retrying in {st['backoff']:.0f}s (plug in the ESP32)"); report(True)
                    time.sleep(st["backoff"]); st["backoff"] = min(st["backoff"] * 2, 15); continue
                try:
                    ser = serial.Serial(port, a.baud, timeout=1); time.sleep(2); st["backoff"] = 1.0; print(f"USB SERIAL connected: {port} @ {a.baud} baud"); report(True)
                except serial.SerialException as e:
                    print(f"Cannot open {port}: {e} (close Arduino Serial Monitor?) retry in {st['backoff']:.0f}s"); ser = None
                    time.sleep(st["backoff"]); st["backoff"] = min(st["backoff"] * 2, 15); continue
            try: line = ser.readline().decode("utf-8", errors="ignore").strip()
            except (serial.SerialException, OSError):
                print("USB link lost - reconnecting..."); ser = None; report(True); continue
            report()
            if spool.n:                                    # backend came back? replay in order
                sent = spool.drain(post)
                if sent: print(f"SYNC: replayed {sent} buffered packet(s)")
            if not line: continue
            if not line.startswith("TELEMETRY:"):
                print(f"[device] {line}"); continue
            try: payload = json.loads(line[10:])
            except json.JSONDecodeError: print("skip malformed:", line[10:80]); continue
            payload["bridge_ts"] = time.time(); payload.setdefault("link_mode", "USB-Serial")
            times.append(time.time()); st["last"] = time.time()
            if post(payload): st["forwarded"] += 1; print(f"[{st['forwarded']}] forwarded seq={payload.get('sequence')}")
            else: st["errors"] += 1; spool.add(payload); print(f"backend unreachable -> buffered locally ({spool.n} waiting)")
    except KeyboardInterrupt:
        print(f"\nStopped. forwarded={st['forwarded']} errors={st['errors']} still-buffered={spool.n}")
    finally:
        if ser: ser.close()

if __name__ == "__main__":
    main()
