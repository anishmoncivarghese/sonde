import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION } from "../version.js";
import type { Db } from "./db.js";

interface SchemaVersionRow {
  value: string;
}

interface TableExistsRow {
  present: number;
}

export class SchemaVersionError extends Error {
  constructor(found: number) {
    super(
      `index schema version ${found} != supported ${SCHEMA_VERSION}; ` +
        'run "codegraph clean" then "codegraph index"',
    );
    this.name = "SchemaVersionError";
  }
}

function currentVersion(db: Db): number | undefined {
  const meta = db
    .prepare(
      "SELECT 1 AS present FROM sqlite_master " +
        "WHERE type = 'table' AND name = 'meta'",
    )
    .get() as TableExistsRow | undefined;
  if (!meta) {
    return undefined;
  }

  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as SchemaVersionRow | undefined;
  return row ? Number(row.value) : undefined;
}

export function migrate(db: Db): void {
  const found = currentVersion(db);
  if (found !== undefined && found !== SCHEMA_VERSION) {
    throw new SchemaVersionError(found);
  }

  const directory = dirname(fileURLToPath(import.meta.url));
  const schema = readFileSync(join(directory, "schema.sql"), "utf8");
  db.transaction(() => {
    db.exec(schema);
    if (found === undefined) {
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?)",
      ).run(String(SCHEMA_VERSION));
    }
  })();
}
