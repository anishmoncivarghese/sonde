CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  path          TEXT NOT NULL UNIQUE,
  language      TEXT,
  content_hash  TEXT NOT NULL,
  mtime_ms      REAL NOT NULL,
  size          INTEGER NOT NULL,
  parse_state   TEXT NOT NULL DEFAULT 'ok',
  diagnostics   TEXT NOT NULL DEFAULT '[]',
  indexed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS symbol (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_key     TEXT NOT NULL UNIQUE,
  file_id        INTEGER NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  qualified_name TEXT NOT NULL,
  short_name     TEXT NOT NULL,
  kind           TEXT NOT NULL,
  signature      TEXT,
  start_byte     INTEGER NOT NULL,
  end_byte       INTEGER NOT NULL,
  start_line     INTEGER NOT NULL,
  end_line       INTEGER NOT NULL,
  body_hash      TEXT,
  exported       INTEGER NOT NULL DEFAULT 0,
  is_test        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS edge (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  src_symbol_id     INTEGER NOT NULL REFERENCES symbol(id) ON DELETE CASCADE,
  dst_symbol_id     INTEGER NOT NULL REFERENCES symbol(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  tier              TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 1.0,
  site_line         INTEGER,
  extractor_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS external_ref (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  src_symbol_id   INTEGER NOT NULL REFERENCES symbol(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  package_or_lib  TEXT NOT NULL,
  site_line       INTEGER
);

CREATE TABLE IF NOT EXISTS unresolved_ref (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  src_symbol_id   INTEGER NOT NULL REFERENCES symbol(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  site_line       INTEGER,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  reason          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_symbol_file  ON symbol(file_id);
CREATE INDEX IF NOT EXISTS idx_symbol_short ON symbol(short_name);
CREATE INDEX IF NOT EXISTS idx_edge_src     ON edge(src_symbol_id);
CREATE INDEX IF NOT EXISTS idx_edge_dst     ON edge(dst_symbol_id);
CREATE INDEX IF NOT EXISTS idx_edge_kind    ON edge(kind);
CREATE INDEX IF NOT EXISTS idx_unres_name   ON unresolved_ref(name);
