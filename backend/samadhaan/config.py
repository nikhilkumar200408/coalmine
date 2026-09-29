"""Central, environment-overridable configuration (all thresholds are PROTOTYPE decision
thresholds -- not officially certified mining-safety limits)."""
import os

def _f(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)

DB_PATH = os.environ.get("SAMADHAAN_DB", "samadhaan.db")
CORS_ORIGINS = [o.strip() for o in os.environ.get("SAMADHAAN_CORS", "*").split(",") if o.strip()]
ADMIN_TOKEN = os.environ.get("SAMADHAAN_ADMIN_TOKEN", "")  # empty => open (prototype/demo)

# ---- Explainable risk weights (sum of maxima = 100) ----
WEIGHTS = {
    "tilt": _f("W_TILT", 30), "strain": _f("W_STRAIN", 30), "persistence": _f("W_PERSIST", 20),
    "trend": _f("W_TREND", 10), "vibration": _f("W_VIB", 10),
}
# value at which each evidence source contributes its full weight
TILT_FULL_DEG = _f("TILT_FULL_DEG", 8.0)
STRAIN_FULL_PCT = _f("STRAIN_FULL_PCT", 20.0)
PERSIST_FULL_S = _f("PERSIST_FULL_S", 60.0)
TREND_FULL_IDX_PER_MIN = _f("TREND_FULL", 0.5)
# an evidence source counts as "active" above these
TILT_ACTIVE_DEG = _f("TILT_ACTIVE_DEG", 1.5)
STRAIN_ACTIVE_PCT = _f("STRAIN_ACTIVE_PCT", 3.0)
VIB_SPIKE = _f("VIB_SPIKE", 12.0)           # vibration units above baseline
# Prototype decision thresholds
LEVELS = [(85, "CRITICAL"), (60, "HIGH"), (35, "CAUTION"), (0, "SAFE")]
THRESHOLD_NOTE = "Prototype decision thresholds \u2014 not officially certified mining-safety limits"

# ---- Baseline learning ----
BASELINE_ALPHA = _f("BASELINE_ALPHA", 0.02)   # baseline_new = (1-a)*old + a*current
BASELINE_WARMUP = int(_f("BASELINE_WARMUP", 15))

# ---- Timing ----
OFFLINE_AFTER_S = _f("OFFLINE_AFTER_S", 12)
SENSOR_FAIL_S = _f("SENSOR_FAIL_S", 8)
TRANSIENT_PERSIST_S = _f("TRANSIENT_PERSIST_S", 20)   # vibration lasting longer + corroboration => structural
WALK_SPEED_MPS = 1.2
