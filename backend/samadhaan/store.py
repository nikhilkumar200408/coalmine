"""SQLite persistence (telemetry history, incidents, events, baselines, scenarios, kv).
Architected behind a tiny interface so it can later move to PostgreSQL."""
import sqlite3, json, threading, time

class Store:
    def __init__(self, path):
        self.lock = threading.Lock()
        self.fail = 0
        self.last_write = None
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("pragma journal_mode=wal")
        for t in ("telemetry(ts REAL,node_id TEXT,source TEXT,data TEXT)",
                  "incidents(id TEXT PRIMARY KEY,data TEXT)", "events(ts REAL,data TEXT)",
                  "baselines(node_id TEXT PRIMARY KEY,data TEXT)", "scenarios(id TEXT PRIMARY KEY,data TEXT)",
                  "kv(k TEXT PRIMARY KEY,v TEXT)"):
            self.db.execute("create table if not exists " + t)
        self.db.execute("create index if not exists ix_t on telemetry(node_id,ts)")
        self.db.commit()

    def _run(self, sql, args=()):
        try:
            with self.lock:
                self.db.execute(sql, args)
            self.last_write = time.time()
        except Exception as e:  # never crash the pipeline on a logging failure
            self.fail += 1
            print("[store] write failed:", e)

    def flush(self):
        try:
            with self.lock:
                self.db.commit()
        except Exception:
            self.fail += 1

    def add_telemetry(self, ts, node_id, source, data):
        self._run("insert into telemetry values (?,?,?,?)", (ts, node_id, source, json.dumps(data)))

    def upsert(self, table, key, data):
        col = "node_id" if table == "baselines" else "id"
        self._run(f"insert or replace into {table} ({col},data) values (?,?)", (key, json.dumps(data)))

    def add_event(self, ts, data):
        self._run("insert into events values (?,?)", (ts, json.dumps(data)))

    def all(self, table):
        with self.lock:
            return [json.loads(r[0]) for r in self.db.execute(f"select data from {table}")]

    def telemetry_recent(self, node_id, limit=1500, since=None, source=None):
        q, a = "select ts,data from telemetry where node_id=?", [node_id]
        if since:
            q += " and ts>=?"; a.append(since)
        if source:
            q += " and source=?"; a.append(source)
        q += " order by ts desc limit ?"; a.append(limit)
        with self.lock:
            rows = self.db.execute(q, a).fetchall()
        return [dict(json.loads(d), ts=t) for t, d in reversed(rows)]

    def kv_get(self, k, default=None):
        with self.lock:
            r = self.db.execute("select v from kv where k=?", (k,)).fetchone()
        return json.loads(r[0]) if r else default

    def kv_set(self, k, v):
        self._run("insert or replace into kv values (?,?)", (k, json.dumps(v)))

    def latest_ts(self):
        with self.lock:
            r = self.db.execute("select max(ts) from telemetry").fetchone()
        return r[0] if r else None
