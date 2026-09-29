"""Illustrative mine model, digital-twin state, heatmaps and safe-route engine.
All geometry is illustrative configuration (metres, local frame) -- not surveyed engineering data."""
import math, heapq
from . import config as C

ORIGIN = (23.6693, 86.9425)  # illustrative anchor (same as legacy node registry default)

MINE = {"id": "MINE-JH-DEMO", "name": "JHARIA MINE", "location": "Jharia coalfield, Jharkhand (illustrative)",
        "lat": ORIGIN[0], "lng": ORIGIN[1], "configured": True, "width": 600, "height": 360}

J = {"J1": (60, 60), "J2": (220, 60), "J3": (380, 60), "J4": (540, 60), "J5": (60, 180), "J6": (220, 180),
     "J7": (380, 180), "J8": (540, 180), "J9": (220, 300), "J10": (380, 300)}
# gallery id: (from, to, sector)
G = {"G1": ("J1", "J2", "A"), "G2": ("J2", "J3", "B"), "G3": ("J3", "J4", "B"), "G4": ("J1", "J5", "A"),
     "G5": ("J2", "J6", "A"), "G6": ("J3", "J7", "B"), "G7": ("J4", "J8", "B"), "G8": ("J5", "J6", "A"),
     "G9": ("J6", "J7", "B"), "G10": ("J7", "J8", "B"), "G11": ("J6", "J9", "C"), "G12": ("J7", "J10", "C"),
     "G13": ("J9", "J10", "C")}
EXITS = {"J1": "Shaft 1 (Main)", "J8": "Shaft 2 (Return)"}
SECTORS = {"A": {"name": "Sector A", "rect": (0, 0, 300, 240), "start": "J6", "workers": 48},
           "B": {"name": "Sector B", "rect": (300, 0, 300, 240), "start": "J7", "workers": 52},
           "C": {"name": "Sector C", "rect": (150, 240, 300, 120), "start": "J9", "workers": 26}}
# installed sensor nodes (installation metadata). NODE-01 is the physical ESP32; the rest are SIMULATED.
NODES = [
    {"id": "NODE-01", "label": "Primary Sensor Node (physical ESP32)", "source": "REAL", "sector": "A", "gallery": "G1", "junction": "J2", "depth_m": None, "installed": "prototype", "firmware": "v6"},
    {"id": "NODE-02", "label": "Sim node", "source": "SIMULATION", "sector": "A", "gallery": "G4", "junction": "J5", "depth_m": 120, "installed": "configured", "firmware": "sim"},
    {"id": "NODE-03", "label": "Sim node", "source": "SIMULATION", "sector": "A", "gallery": "G8", "junction": "J6", "depth_m": 120, "installed": "configured", "firmware": "sim"},
    {"id": "NODE-04", "label": "Sim node", "source": "SIMULATION", "sector": "B", "gallery": "G2", "junction": "J3", "depth_m": 120, "installed": "configured", "firmware": "sim"},
    {"id": "NODE-05", "label": "Sim node", "source": "SIMULATION", "sector": "B", "gallery": "G9", "junction": "J7", "depth_m": 120, "installed": "configured", "firmware": "sim"},
    {"id": "NODE-06", "label": "Sim node", "source": "SIMULATION", "sector": "B", "gallery": "G10", "junction": "J8", "depth_m": 120, "installed": "configured", "firmware": "sim"},
    {"id": "NODE-07", "label": "Sim node", "source": "SIMULATION", "sector": "C", "gallery": "G11", "junction": "J9", "depth_m": 135, "installed": "configured", "firmware": "sim"},
    {"id": "NODE-08", "label": "Sim node", "source": "SIMULATION", "sector": "C", "gallery": "G13", "junction": "J10", "depth_m": 135, "installed": "configured", "firmware": "sim"},
]
for n in NODES:
    n["x"], n["y"] = J[n["junction"]]
    lat = ORIGIN[0] - (n["y"] - 180) / 111320.0
    lng = ORIGIN[1] + (n["x"] - 300) / (111320.0 * math.cos(math.radians(ORIGIN[0])))
    n["lat"], n["lng"] = round(lat, 6), round(lng, 6)
for n in NODES:
    n["nearby"] = [m["id"] for m in sorted((m for m in NODES if m is not n), key=lambda m: math.dist((n["x"], n["y"]), (m["x"], m["y"])))[:2]]
VENT = {"fan": {"junction": "J1", "label": "Main fan (modelled)"},
        "paths": {"A": ["G1", "G4", "G5", "G8"], "B": ["G2", "G3", "G6", "G7", "G9", "G10"], "C": ["G11", "G12", "G13"]}}
# Illustrative configuration for the multi-mine overview (clearly not real figures)
OTHER_MINES = [
    {"id": "MINE-RN-DEMO", "name": "RANIGANJ MINE", "location": "West Bengal (illustrative)", "lat": 23.62, "lng": 87.13, "nodes": 14, "online": 14, "workers": 88, "risk": "SAFE", "vent": "NORMAL", "incidents": 0},
    {"id": "MINE-KR-DEMO", "name": "KORBA MINE", "location": "Chhattisgarh (illustrative)", "lat": 22.35, "lng": 82.69, "nodes": 20, "online": 18, "workers": 126, "risk": "CAUTION", "vent": "NORMAL", "incidents": 1},
    {"id": "MINE-SG-DEMO", "name": "SINGRAULI MINE", "location": "Madhya Pradesh (illustrative)", "lat": 24.2, "lng": 82.67, "nodes": 12, "online": 12, "workers": 64, "risk": "SAFE", "vent": "NORMAL", "incidents": 0},
]
RANK = {"UNKNOWN": 1, "SAFE": 0, "CAUTION": 1, "HIGH": 2, "CRITICAL": 3}

def dist(a, b):
    return math.dist(J[a], J[b])

def glen(gid):
    a, b, _ = G[gid]
    return dist(a, b)

def node_dist(n1, n2):
    return round(math.dist((n1["x"], n1["y"]), (n2["x"], n2["y"])), 1)

def _dijkstra(start, cost_of):
    adj = {}
    for gid, (a, b, s) in G.items():
        c = cost_of(gid)
        if c is None:
            continue
        adj.setdefault(a, []).append((b, gid, c)); adj.setdefault(b, []).append((a, gid, c))
    d, prev, pq = {start: 0.0}, {}, [(0.0, start)]
    while pq:
        cd, u = heapq.heappop(pq)
        if cd > d.get(u, 1e18):
            continue
        for v, gid, c in adj.get(u, []):
            nd = cd + c
            if nd < d.get(v, 1e18):
                d[v], prev[v] = nd, (u, gid); heapq.heappush(pq, (nd, v))
    return d, prev

def _path(prev, end, start):
    p, e, cur = [end], [], end
    while cur != start:
        cur, gid = prev[cur]; p.append(cur); e.append(gid)
    return p[::-1], e[::-1]

def compute_route(sector, sector_level, vent, hot_galleries):
    """Cost grows with risk / ventilation failure / incident zones; CRITICAL sectors (other than the
    worker's own) and FAILED-ventilation sectors are blocked. Own sector edges are penalised, not blocked,
    so a route out always exists."""
    start = SECTORS[sector]["start"]
    def mult(gid, use_risk):
        s = G[gid][2]
        if not use_risk:
            return 1.0
        lvl, v = sector_level.get(s, "SAFE"), vent.get(s, "NORMAL")
        if s != sector and (lvl == "CRITICAL" or v == "FAILED"):
            return None
        m = {"SAFE": 1.0, "UNKNOWN": 1.2, "CAUTION": 1.6, "HIGH": 5.0, "CRITICAL": 20.0}[lvl]
        m *= {"NORMAL": 1.0, "DEGRADED": 2.0, "FAILED": 20.0}[v]
        if gid in hot_galleries:
            m *= 3.0
        return m
    def solve(use_risk):
        d, prev = _dijkstra(start, lambda g: None if mult(g, use_risk) is None else glen(g) * mult(g, use_risk))
        ex = [(d[e], e) for e in EXITS if e in d]
        if not ex:
            return None
        _, e = min(ex)
        nodes, edges = _path(prev, e, start)
        return {"exit": e, "exit_name": EXITS[e], "junctions": nodes, "galleries": edges,
                "distance_m": round(sum(glen(g) for g in edges), 1)}
    best, ref = solve(True), solve(False)
    blocked = sorted(g for g in G if mult(g, True) is None)
    if not best:
        return {"sector": sector, "start": start, "found": False, "blocked": blocked,
                "reason": "No safe route available - all exits blocked. Engineer confirmation required."}
    best.update(found=True, sector=sector, start=start, blocked=blocked,
                time_s=round(best["distance_m"] / C.WALK_SPEED_MPS))
    best["changed_from_normal"] = ref is not None and best["galleries"] != ref["galleries"]
    if best["changed_from_normal"]:
        best["reason"] = (f"Default route {'>'.join(ref['galleries']) or 'n/a'} avoided (risk/ventilation/blocked: {', '.join(blocked) or 'penalised sections'}); "
                          f"route via {'>'.join(best['galleries'])} to {best['exit_name']} selected.")
    else:
        best["reason"] = f"Shortest available route to {best['exit_name']}; no sections blocked on this path."
    return best

def sector_status_text(level):
    return {"SAFE": "SAFE", "UNKNOWN": "LIMITED DATA", "CAUTION": "STAY ALERT", "HIGH": "MOVE TO SAFE ZONE", "CRITICAL": "EVACUATE SECTOR"}[level]

def heat_grid(points, sigma=110.0, nx=30, ny=18, w=600, h=360):
    """Gaussian-weighted field from [(x,y,value)]; returns nx*ny list of 0..100 (max-blend)."""
    out = []
    for j in range(ny):
        for i in range(nx):
            cx, cy = (i + .5) * w / nx, (j + .5) * h / ny
            v = 0.0
            for x, y, val in points:
                v = max(v, val * math.exp(-((cx - x) ** 2 + (cy - y) ** 2) / (2 * sigma ** 2)))
            out.append(round(v, 1))
    return {"nx": nx, "ny": ny, "cells": out}
