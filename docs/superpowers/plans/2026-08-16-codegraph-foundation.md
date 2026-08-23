# Sonde Foundation (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic TypeScript code indexer that produces a tier-labelled symbol graph in SQLite, with measured edge accuracy against a `tsc` oracle.

**Architecture:** Four-phase pipeline — EXTRACT (per-file, pure, tree-sitter) → LINK (module resolution + export-map fixpoint) → RESOLVE (evidence-tiered edge creation) → STORE (SQLite + FTS5). Extraction is pure so it parallelizes, caches by content hash, and keeps the adapter contract small enough for a second language. The `tsc` oracle is built *before* the resolver so the resolver is developed against a measurable target.

**Tech Stack:** TypeScript (strict), Node 22+, `web-tree-sitter` (WASM), `better-sqlite3`, `typescript` (bundled, for the oracle and the optional upgrade pass), `vitest`, `commander`.

**Spec:** `docs/superpowers/specs/2026-08-16-sonde-design.md` (revision 2)

## Global Constraints

- **Node 22+**; ESM only (`"type": "module"`). TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.
  - ⚠️ This machine's default `node` is **v20.20.2**. Run `nvm use` (an `.nvmrc` pinning v24 is created in Task 1) in **every** shell before any `npm` or `node` command. Node 20 is past EOL and `better-sqlite3@13` requires `>=22`.
- **Zero native compilation.** `web-tree-sitter` is WASM. `better-sqlite3` must resolve to a prebuilt binary — never a source build.
  - **The version floor is `^13.0.0`, and it is load-bearing.** `better-sqlite3@11.x` has no `prebuilds/` directory and compiles from source via `node-gyp` — verified during Task 1. Only 13.x ships the N-API prebuilds this constraint depends on. Do not lower this pin.
  - **Verified 2026-08-16:** `better-sqlite3@13.0.3` ships N-API prebuilds (`prebuilds/darwin-arm64.node`, linux/musl/win32, x64 + arm64), installs in 2 packages / ~2s with no `node-gyp`, and FTS5 + WAL both work on SQLite 3.53.4. Task 1 Step 5 re-confirms this in the real project; it is a regression check, not an open question.
- **SEC-008:** never execute repository code. The bundled `typescript` is used; **never** `require` `typescript` from the target repo (spec §5.3).
- **SEC-001/002/003:** all filesystem reads go through `repo/boundary.ts`. No other module calls `fs` with a caller-supplied path.
- **`node_modules` is excluded from indexing but readable as resolution input** (spec §4.2). Enforced by test.
- **Tier vocabulary is fixed:** `COMPILER` | `LEXICAL` | `HEURISTIC` | `EXTERNAL` | `UNRESOLVED`. Sort order `COMPILER > LEXICAL > HEURISTIC`.
- **Edge kinds are fixed:** `CONTAINS` | `IMPORTS` | `CALLS` | `REFERENCES` | `IMPLEMENTS` | `INHERITS` | `TESTS`.
- **`kind` vocabulary is fixed:** `file` | `module` | `class` | `interface` | `type` | `enum` | `function` | `method` | `property` | `variable` | `test`.
- **Never fabricate.** An unknown target is `EXTERNAL` or `UNRESOLVED` with a reason — never a guessed edge, never a dropped reference.
- **Commit after every task.** Conventional commits (`feat:`, `test:`, `fix:`, `chore:`).

---

## File Structure

```
src/
  repo/
    boundary.ts        # canonicalize + containment check. THE security boundary.
    ignore.ts          # .gitignore + .sondeignore matching
    discover.ts        # walk + filter + hash → FileRecord[]
    git.ts             # revision, dirty state
  store/
    schema.sql         # DDL, one statement per line-group
    migrate.ts         # schema_version tracking, refuse-on-mismatch
    db.ts              # open/close, WAL, busy_timeout, transaction helper
    repos.ts           # typed accessors: files, symbols, edges, refs
  adapters/
    types.ts           # LanguageAdapter, ExtractResult, records
    registry.ts        # path → adapter
    typescript/
      parser.ts        # tree-sitter WASM init + parse
      symbols.ts       # symbol extraction + stable_key
      references.ts    # reference extraction
      modules.ts       # import/export table extraction
      index.ts         # assembles the LanguageAdapter
  tsconfig/
    load.ts            # discovery + extends chain resolution
    resolve.ts         # specifier → absolute path
  link/
    exportmap.ts       # cycle-safe export-set fixpoint
    imports.ts         # per-file import table binding
  resolve/
    symboltable.ts     # global name → symbol index
    tiers.ts           # tier assignment rules
    resolver.ts        # orchestration → edges + external + unresolved
  index/
    pipeline.ts        # full + incremental orchestration
    drift.ts           # stat-based drift detection
  cli/
    main.ts            # commander wiring
bench/
  oracle/
    program.ts         # tsc Program construction from a fixture
    ancestry.ts        # position → enclosing symbol, INDEPENDENT of src/
    extract.ts         # ground-truth edge set
    compare.ts         # precision/recall per kind × tier
tests/
  fixtures/ts/         # golden extraction fixtures
  fixtures/repos/      # small oracle fixture repos
spikes/
  swift/               # THROWAWAY. Deleted at end of Task 5.
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/version.ts`, `tests/scaffold.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing
- Produces: `SCHEMA_VERSION: number`, `EXTRACTOR_VERSION: string` from `src/version.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/scaffold.test.ts
import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, EXTRACTOR_VERSION } from "../src/version.js";

describe("scaffold", () => {
  it("exposes integer schema version", () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
  it("exposes a semver-ish extractor version", () => {
    expect(EXTRACTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scaffold.test.ts`
Expected: FAIL — cannot resolve `../src/version.js`

- [ ] **Step 3: Create the project files**

`package.json`:
```json
{
  "name": "sonde",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "bin": { "sonde": "./dist/cli/main.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^13.0.0",
    "commander": "^12.0.0",
    "web-tree-sitter": "^0.24.0",
    "typescript": "^5.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "vitest": "^2.0.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Oracle fixture repos contain real .test.ts files that are INPUT DATA for
    // the tsc oracle (Task 11), not tests of this project. Without this exclude
    // vitest collects and runs them, and they fail.
    exclude: ["**/node_modules/**", "tests/fixtures/**"],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
vendor/
*.sqlite
.sonde/
```

`.nvmrc` — this machine's default node is v20, which cannot run the project:
```
24
```

`src/version.ts`:
```ts
export const SCHEMA_VERSION = 1;
export const EXTRACTOR_VERSION = "0.1.0";
```

- [ ] **Step 4: Install and run tests**

Run: `nvm use && npm install && npx vitest run tests/scaffold.test.ts`
Expected: node switches to v24; PASS, 2 tests.
If `npm install` emits `EBADENGINE`, you are on the wrong node — run `nvm use` and reinstall.

- [ ] **Step 5: Confirm the prebuilt binary, FTS5, and WAL**

Run:
```bash
ls node_modules/better-sqlite3/prebuilds/ && node -e "
const D=require('better-sqlite3'); const d=new D(':memory:');
d.exec('CREATE VIRTUAL TABLE t USING fts5(x)');
d.prepare(\"INSERT INTO t(x) VALUES ('hello world')\").run();
console.log('fts5:', d.prepare(\"SELECT x FROM t WHERE t MATCH 'hello'\").get());
d.pragma('journal_mode = WAL'); console.log('wal: ok');
d.close();"
```
Expected: a `prebuilds/` listing including `darwin-arm64.node`, then `fts5: { x: 'hello world' }` and `wal: ok`.

This was verified outside the project on 2026-08-16 and passed. If it fails **here**, something in the project's install differs — stop and resolve it before Task 2, because a source build breaks the zero-install Global Constraint.

- [ ] **Step 6: Add CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/version.ts tests/scaffold.test.ts .github/workflows/ci.yml
git commit -m "chore: scaffold TypeScript project with vitest and CI"
```

---

### Task 2: Repository boundary — the security surface

**Files:**
- Create: `src/repo/boundary.ts`, `tests/repo/boundary.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `class RepoBoundary { constructor(root: string); readonly root: string; contains(p: string): boolean; resolve(rel: string): string; readFile(rel: string): Buffer; }`
  - `class PathEscapeError extends Error`

Every other module reads files through this. Spec SEC-001/002/003.

- [ ] **Step 1: Write the failing test**

```ts
// tests/repo/boundary.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoBoundary, PathEscapeError } from "../../src/repo/boundary.js";

let root: string, outside: string;

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), "cg-"));
  root = join(base, "repo");
  outside = join(base, "outside");
  mkdirSync(root); mkdirSync(outside);
  writeFileSync(join(root, "a.ts"), "export const a = 1;");
  writeFileSync(join(outside, "secret.txt"), "SECRET");
  symlinkSync(join(outside, "secret.txt"), join(root, "escape.txt"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("RepoBoundary", () => {
  it("reads a file inside the root", () => {
    const b = new RepoBoundary(root);
    expect(b.readFile("a.ts").toString()).toContain("export const a");
  });

  it("rejects ../ traversal", () => {
    const b = new RepoBoundary(root);
    expect(() => b.resolve("../outside/secret.txt")).toThrow(PathEscapeError);
  });

  it("rejects an absolute path outside the root", () => {
    const b = new RepoBoundary(root);
    expect(() => b.resolve(join(outside, "secret.txt"))).toThrow(PathEscapeError);
  });

  it("rejects a symlink that escapes the root", () => {
    const b = new RepoBoundary(root);
    expect(() => b.readFile("escape.txt")).toThrow(PathEscapeError);
  });

  it("rejects a NUL byte in the path", () => {
    const b = new RepoBoundary(root);
    expect(() => b.resolve("a .ts")).toThrow(PathEscapeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repo/boundary.test.ts`
Expected: FAIL — cannot resolve `boundary.js`

- [ ] **Step 3: Implement**

```ts
// src/repo/boundary.ts
import { realpathSync, readFileSync, statSync } from "node:fs";
import { resolve, sep, isAbsolute } from "node:path";

export class PathEscapeError extends Error {
  constructor(p: string) {
    super(`path escapes repository root: ${p}`);
    this.name = "PathEscapeError";
  }
}

export class RepoBoundary {
  readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(resolve(root));
  }

  contains(p: string): boolean {
    const abs = resolve(p);
    return abs === this.root || abs.startsWith(this.root + sep);
  }

  /** Resolve a repo-relative path to absolute, refusing anything outside the root. */
  resolve(rel: string): string {
    if (rel.includes(" ")) throw new PathEscapeError(rel);
    const abs = isAbsolute(rel) ? resolve(rel) : resolve(this.root, rel);
    if (!this.contains(abs)) throw new PathEscapeError(rel);

    // Resolve symlinks and re-check: a link inside the root may point outside it.
    let real: string;
    try {
      real = realpathSync(abs);
    } catch {
      return abs; // does not exist yet; the containment check above already passed
    }
    if (!this.contains(real)) throw new PathEscapeError(rel);
    return real;
  }

  readFile(rel: string): Buffer {
    const abs = this.resolve(rel);
    if (!statSync(abs).isFile()) throw new PathEscapeError(rel);
    return readFileSync(abs);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/repo/boundary.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/repo/boundary.ts tests/repo/boundary.test.ts
git commit -m "feat: add repository boundary with symlink and traversal rejection"
```

---

### Task 3: Ignore rules, discovery, and hashing

**Files:**
- Create: `src/repo/ignore.ts`, `src/repo/discover.ts`, `tests/repo/discover.test.ts`

**Interfaces:**
- Consumes: `RepoBoundary` from Task 2
- Produces:
  - `interface FileRecord { path: string; contentHash: string; mtimeMs: number; size: number; }`
  - `function buildIgnore(boundary: RepoBoundary): IgnoreMatcher`
  - `interface IgnoreMatcher { ignores(relPath: string): boolean; }`
  - `function discover(boundary: RepoBoundary, opts?: { maxBytes?: number }): FileRecord[]`

`mtimeMs` and `size` exist for the drift check in Task 14 (spec §8.2).

- [ ] **Step 1: Write the failing test**

```ts
// tests/repo/discover.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { discover } from "../../src/repo/discover.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cg-disc-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, ".gitignore"), "dist/\n*.log\n");
  writeFileSync(join(root, ".sondeignore"), "src/generated.ts\n");
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "generated.ts"), "export const g = 1;");
  writeFileSync(join(root, "node_modules", "pkg", "i.ts"), "export const p = 1;");
  writeFileSync(join(root, "dist", "a.js"), "1");
  writeFileSync(join(root, "debug.log"), "noise");
});

describe("discover", () => {
  const paths = () => discover(new RepoBoundary(root)).map(f => f.path).sort();

  it("includes ordinary source files", () => expect(paths()).toContain("src/a.ts"));
  it("excludes node_modules", () => expect(paths().some(p => p.startsWith("node_modules"))).toBe(false));
  it("honours .gitignore directories", () => expect(paths().some(p => p.startsWith("dist"))).toBe(false));
  it("honours .gitignore globs", () => expect(paths()).not.toContain("debug.log"));
  it("honours .sondeignore", () => expect(paths()).not.toContain("src/generated.ts"));

  it("records hash, mtime and size", () => {
    const f = discover(new RepoBoundary(root)).find(x => x.path === "src/a.ts")!;
    expect(f.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.size).toBeGreaterThan(0);
    expect(f.mtimeMs).toBeGreaterThan(0);
  });

  it("skips files over the size cap", () => {
    writeFileSync(join(root, "src", "big.ts"), "x".repeat(5000));
    const found = discover(new RepoBoundary(root), { maxBytes: 1000 }).map(f => f.path);
    expect(found).not.toContain("src/big.ts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repo/discover.test.ts`
Expected: FAIL — cannot resolve `discover.js`

- [ ] **Step 3: Implement the ignore matcher**

```ts
// src/repo/ignore.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoBoundary } from "./boundary.js";

const ALWAYS_IGNORED = new Set([
  ".git", "node_modules", ".sonde", "dist", "build", "out",
  ".next", ".turbo", "coverage", "__pycache__", ".venv",
]);

interface Rule { re: RegExp; dirOnly: boolean; negated: boolean; }

function toRegExp(pattern: string): RegExp {
  // gitignore glob → regex. Handles **, *, ? and anchoring.
  let p = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  p = p.replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*");
  p = p.replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  const anchored = pattern.includes("/") && !pattern.startsWith("**");
  return new RegExp(anchored ? `^${p}$` : `(^|/)${p}$`);
}

export interface IgnoreMatcher { ignores(relPath: string): boolean; }

export function buildIgnore(boundary: RepoBoundary): IgnoreMatcher {
  const rules: Rule[] = [];
  for (const name of [".gitignore", ".sondeignore"]) {
    const abs = join(boundary.root, name);
    if (!existsSync(abs)) continue;
    for (const raw of readFileSync(abs, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const negated = line.startsWith("!");
      const body = negated ? line.slice(1) : line;
      const dirOnly = body.endsWith("/");
      const pattern = dirOnly ? body.slice(0, -1) : body;
      rules.push({ re: toRegExp(pattern), dirOnly, negated });
    }
  }

  return {
    ignores(relPath: string): boolean {
      for (const seg of relPath.split("/")) {
        if (ALWAYS_IGNORED.has(seg)) return true;
      }
      let ignored = false;
      for (const r of rules) {
        // A dirOnly rule matches the directory itself or anything beneath it.
        const hit = r.dirOnly
          ? relPath.split("/").some((_, i, a) => r.re.test(a.slice(0, i + 1).join("/")))
          : r.re.test(relPath);
        if (hit) ignored = !r.negated;
      }
      return ignored;
    },
  };
}
```

- [ ] **Step 4: Implement discovery**

```ts
// src/repo/discover.ts
import { readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import type { RepoBoundary } from "./boundary.js";
import { buildIgnore } from "./ignore.js";

export interface FileRecord {
  path: string;        // repo-relative, POSIX separators
  contentHash: string; // sha256 hex
  mtimeMs: number;
  size: number;
}

const DEFAULT_MAX_BYTES = 2_000_000;
const SOURCE_EXT = new Set([".ts", ".tsx", ".mts", ".cts"]);

export function discover(
  boundary: RepoBoundary,
  opts: { maxBytes?: number } = {},
): FileRecord[] {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const ignore = buildIgnore(boundary);
  const out: FileRecord[] = [];

  const walk = (absDir: string): void => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, entry.name);
      const rel = relative(boundary.root, abs).split(sep).join("/");
      if (ignore.ignores(rel)) continue;

      if (entry.isSymbolicLink()) continue;   // SEC-002: never follow links during discovery
      if (entry.isDirectory()) { walk(abs); continue; }
      if (!entry.isFile()) continue;

      const dot = entry.name.lastIndexOf(".");
      if (dot < 0 || !SOURCE_EXT.has(entry.name.slice(dot))) continue;

      const st = statSync(abs);
      if (st.size > maxBytes) continue;

      const bytes = boundary.readFile(rel);
      out.push({
        path: rel,
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        mtimeMs: st.mtimeMs,
        size: st.size,
      });
    }
  };

  walk(boundary.root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/repo/discover.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add src/repo/ignore.ts src/repo/discover.ts tests/repo/discover.test.ts
git commit -m "feat: add ignore rules and content-hashed file discovery"
```

---

### Task 4: SQLite store — schema, migrations, accessors

**Files:**
- Create: `src/store/schema.sql`, `src/store/db.ts`, `src/store/migrate.ts`, `src/store/repos.ts`, `tests/store/store.test.ts`

**Interfaces:**
- Consumes: `SCHEMA_VERSION` (Task 1), `FileRecord` (Task 3)
- Produces:
  - `function openDb(path: string): Database` — WAL, `busy_timeout=5000`
  - `function migrate(db: Database): void` — throws `SchemaVersionError` on mismatch
  - `class Store` with `upsertFile`, `getFile`, `allFiles`, `deleteFile`, `insertSymbols`, `insertEdges`, `insertExternal`, `insertUnresolved`, `symbolsInFile`, `findSymbolsByName`, `transaction<T>(fn): T`

- [ ] **Step 1: Write the failing test**

```ts
// tests/store/store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, Store, SchemaVersionError } from "../../src/store/index.js";

let store: Store;
beforeEach(() => {
  const db = openDb(":memory:");
  migrate(db);
  store = new Store(db);
});

describe("Store", () => {
  it("round-trips a file record", () => {
    store.upsertFile({ path: "a.ts", contentHash: "h1", mtimeMs: 100, size: 10 });
    expect(store.getFile("a.ts")?.contentHash).toBe("h1");
  });

  it("updates an existing file rather than duplicating", () => {
    store.upsertFile({ path: "a.ts", contentHash: "h1", mtimeMs: 100, size: 10 });
    store.upsertFile({ path: "a.ts", contentHash: "h2", mtimeMs: 200, size: 20 });
    expect(store.allFiles()).toHaveLength(1);
    expect(store.getFile("a.ts")?.contentHash).toBe("h2");
  });

  it("cascades symbol deletion when a file is deleted", () => {
    store.upsertFile({ path: "a.ts", contentHash: "h", mtimeMs: 1, size: 1 });
    store.insertSymbols([{
      stableKey: "ts:a.ts#foo", filePath: "a.ts", qualifiedName: "foo", shortName: "foo",
      kind: "function", signature: "()=>void", startLine: 1, endLine: 2,
      startByte: 0, endByte: 10, bodyHash: "b", exported: true, isTest: false,
    }]);
    expect(store.symbolsInFile("a.ts")).toHaveLength(1);
    store.deleteFile("a.ts");
    expect(store.symbolsInFile("a.ts")).toHaveLength(0);
  });

  it("rejects a duplicate stable key rather than silently overwriting", () => {
    store.upsertFile({ path: "a.ts", contentHash: "h", mtimeMs: 1, size: 1 });
    const s = {
      stableKey: "ts:a.ts#foo", filePath: "a.ts", qualifiedName: "foo", shortName: "foo",
      kind: "function" as const, signature: "()", startLine: 1, endLine: 2,
      startByte: 0, endByte: 5, bodyHash: "b", exported: true, isTest: false,
    };
    expect(() => store.insertSymbols([s, s])).toThrow();
  });

  it("rolls back a failed transaction", () => {
    expect(() => store.transaction(() => {
      store.upsertFile({ path: "b.ts", contentHash: "h", mtimeMs: 1, size: 1 });
      throw new Error("boom");
    })).toThrow("boom");
    expect(store.getFile("b.ts")).toBeUndefined();
  });

  it("refuses to migrate a future schema version", () => {
    const db = openDb(":memory:");
    migrate(db);
    db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run("999");
    expect(() => migrate(db)).toThrow(SchemaVersionError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/store.test.ts`
Expected: FAIL — cannot resolve `src/store/index.js`

- [ ] **Step 3: Write the schema**

```sql
-- src/store/schema.sql
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
```

- [ ] **Step 4: Implement db, migrate, and Store**

```ts
// src/store/db.ts
import Database from "better-sqlite3";
export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  return db;
}
```

```ts
// src/store/migrate.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCHEMA_VERSION } from "../version.js";
import type { Db } from "./db.js";

export class SchemaVersionError extends Error {
  constructor(found: number) {
    super(`index schema version ${found} != supported ${SCHEMA_VERSION}; run "sonde index --rebuild"`);
    this.name = "SchemaVersionError";
  }
}

export function migrate(db: Db): void {
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(join(here, "schema.sql"), "utf8"));

  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string } | undefined;

  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    return;
  }
  const found = Number(row.value);
  if (found !== SCHEMA_VERSION) throw new SchemaVersionError(found);
}
```

```ts
// src/store/repos.ts
import type { Db } from "./db.js";
import { EXTRACTOR_VERSION } from "../version.js";
import type { FileRecord } from "../repo/discover.js";

export type SymbolKind =
  | "file" | "module" | "class" | "interface" | "type" | "enum"
  | "function" | "method" | "property" | "variable" | "test";

export type Tier = "COMPILER" | "LEXICAL" | "HEURISTIC" | "EXTERNAL" | "UNRESOLVED";
export type EdgeKind =
  | "CONTAINS" | "IMPORTS" | "CALLS" | "REFERENCES" | "IMPLEMENTS" | "INHERITS" | "TESTS";

export interface SymbolRow {
  stableKey: string; filePath: string; qualifiedName: string; shortName: string;
  kind: SymbolKind; signature: string | null;
  startByte: number; endByte: number; startLine: number; endLine: number;
  bodyHash: string | null; exported: boolean; isTest: boolean;
}

export interface EdgeRow {
  srcKey: string; dstKey: string; kind: EdgeKind; tier: Tier;
  confidence: number; siteLine: number | null;
}

export class Store {
  constructor(private readonly db: Db) {}

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  upsertFile(f: FileRecord & { language?: string }): void {
    this.db.prepare(`
      INSERT INTO file (path, language, content_hash, mtime_ms, size)
      VALUES (@path, @language, @contentHash, @mtimeMs, @size)
      ON CONFLICT(path) DO UPDATE SET
        content_hash = excluded.content_hash,
        mtime_ms     = excluded.mtime_ms,
        size         = excluded.size,
        indexed_at   = datetime('now')
    `).run({ ...f, language: f.language ?? "typescript" });
  }

  getFile(path: string): { id: number; contentHash: string; mtimeMs: number; size: number } | undefined {
    const r = this.db.prepare(
      "SELECT id, content_hash AS contentHash, mtime_ms AS mtimeMs, size FROM file WHERE path = ?",
    ).get(path) as any;
    return r ?? undefined;
  }

  allFiles(): Array<{ path: string; contentHash: string; mtimeMs: number; size: number }> {
    return this.db.prepare(
      "SELECT path, content_hash AS contentHash, mtime_ms AS mtimeMs, size FROM file",
    ).all() as any;
  }

  deleteFile(path: string): void {
    this.db.prepare("DELETE FROM file WHERE path = ?").run(path);
  }

  insertSymbols(rows: SymbolRow[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO symbol
        (stable_key, file_id, qualified_name, short_name, kind, signature,
         start_byte, end_byte, start_line, end_line, body_hash, exported, is_test)
      VALUES
        (@stableKey, (SELECT id FROM file WHERE path = @filePath), @qualifiedName, @shortName,
         @kind, @signature, @startByte, @endByte, @startLine, @endLine,
         @bodyHash, @exported, @isTest)
    `);
    for (const r of rows) {
      stmt.run({ ...r, exported: r.exported ? 1 : 0, isTest: r.isTest ? 1 : 0 });
    }
  }

  insertEdges(rows: EdgeRow[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO edge (src_symbol_id, dst_symbol_id, kind, tier, confidence, site_line, extractor_version)
      VALUES ((SELECT id FROM symbol WHERE stable_key = @srcKey),
              (SELECT id FROM symbol WHERE stable_key = @dstKey),
              @kind, @tier, @confidence, @siteLine, @ev)
    `);
    for (const r of rows) stmt.run({ ...r, ev: EXTRACTOR_VERSION });
  }

  insertExternal(rows: Array<{ srcKey: string; name: string; packageOrLib: string; siteLine: number | null }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO external_ref (src_symbol_id, name, package_or_lib, site_line)
      VALUES ((SELECT id FROM symbol WHERE stable_key = @srcKey), @name, @packageOrLib, @siteLine)
    `);
    for (const r of rows) stmt.run(r);
  }

  insertUnresolved(rows: Array<{
    srcKey: string; name: string; kind: string; siteLine: number | null;
    candidateCount: number; reason: string;
  }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO unresolved_ref (src_symbol_id, name, kind, site_line, candidate_count, reason)
      VALUES ((SELECT id FROM symbol WHERE stable_key = @srcKey), @name, @kind, @siteLine, @candidateCount, @reason)
    `);
    for (const r of rows) stmt.run(r);
  }

  symbolsInFile(path: string): SymbolRow[] {
    return this.db.prepare(`
      SELECT s.stable_key AS stableKey, f.path AS filePath, s.qualified_name AS qualifiedName,
             s.short_name AS shortName, s.kind, s.signature,
             s.start_byte AS startByte, s.end_byte AS endByte,
             s.start_line AS startLine, s.end_line AS endLine,
             s.body_hash AS bodyHash, s.exported, s.is_test AS isTest
      FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.path = ?
    `).all(path) as any;
  }

  findSymbolsByName(shortName: string): SymbolRow[] {
    return this.db.prepare(`
      SELECT s.stable_key AS stableKey, f.path AS filePath, s.qualified_name AS qualifiedName,
             s.short_name AS shortName, s.kind, s.signature,
             s.start_byte AS startByte, s.end_byte AS endByte,
             s.start_line AS startLine, s.end_line AS endLine,
             s.body_hash AS bodyHash, s.exported, s.is_test AS isTest
      FROM symbol s JOIN file f ON f.id = s.file_id WHERE s.short_name = ?
    `).all(shortName) as any;
  }
}
```

```ts
// src/store/index.ts
export { openDb, type Db } from "./db.js";
export { migrate, SchemaVersionError } from "./migrate.js";
export { Store } from "./repos.js";
export type { SymbolRow, EdgeRow, SymbolKind, Tier, EdgeKind } from "./repos.js";
```

- [ ] **Step 5: Ensure schema.sql ships to dist**

Add to `package.json` scripts:
```json
"build": "tsc -p tsconfig.json && cp src/store/schema.sql dist/store/schema.sql"
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/store/store.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 7: Commit**

```bash
git add src/store tests/store package.json
git commit -m "feat: add SQLite store with schema versioning and cascade deletes"
```

---

### Task 5: Tree-sitter plumbing and the adapter contract

**Files:**
- Create: `src/adapters/types.ts`, `src/adapters/typescript/parser.ts`, `tests/adapters/parser.test.ts`
- Create: `scripts/fetch-grammars.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface LanguageAdapter`, `interface ExtractResult`, `interface SymbolRecord`, `interface ReferenceRecord`, `interface ImportRecord`, `interface ExportRecord`, `interface Diagnostic`
  - `async function getTsParser(): Promise<Parser>`

This is the contract the Swift spike (Task 6) validates. Do not finalize it before that task reports.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/parser.test.ts
import { describe, it, expect } from "vitest";
import { getTsParser } from "../../src/adapters/typescript/parser.js";

describe("tree-sitter parser", () => {
  it("parses a TypeScript function", async () => {
    const p = await getTsParser();
    const tree = p.parse("export function foo(a: number): number { return a; }");
    expect(tree.rootNode.type).toBe("program");
    expect(tree.rootNode.hasError).toBe(false);
  });

  it("returns a tree with an error flag for broken source rather than throwing", async () => {
    const p = await getTsParser();
    const tree = p.parse("export function foo( {");
    expect(tree.rootNode.hasError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adapters/parser.test.ts`
Expected: FAIL — cannot resolve `parser.js`

- [ ] **Step 3: Add the grammar fetch script**

```js
// scripts/fetch-grammars.mjs
// Downloads prebuilt tree-sitter WASM grammars into vendor/.
// Pinned by version so the extractor_manifest_hash is meaningful.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const GRAMMARS = [
  { name: "tree-sitter-typescript.wasm", url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-typescript.wasm" },
  { name: "tree-sitter-tsx.wasm",        url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-tsx.wasm" },
  { name: "tree-sitter-swift.wasm",      url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-swift.wasm" },
];

const dir = join(process.cwd(), "vendor");
mkdirSync(dir, { recursive: true });

for (const g of GRAMMARS) {
  const dest = join(dir, g.name);
  if (existsSync(dest)) { console.log("cached", g.name); continue; }
  const res = await fetch(g.url);
  if (!res.ok) throw new Error(`failed to fetch ${g.name}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("fetched", g.name);
}
```

Add to `package.json`: `"postinstall": "node scripts/fetch-grammars.mjs"` and add `vendor/` to `.gitignore`.

- [ ] **Step 4: Define the adapter contract**

```ts
// src/adapters/types.ts
import type { SymbolKind } from "../store/repos.js";

export interface SymbolRecord {
  stableKey: string;
  qualifiedName: string;
  shortName: string;
  kind: SymbolKind;
  signature: string | null;
  startByte: number; endByte: number;
  startLine: number; endLine: number;
  bodyHash: string | null;
  exported: boolean;
  isTest: boolean;
}

/** A reference the adapter saw but cannot resolve — resolution is not the adapter's job. */
export interface ReferenceRecord {
  fromSymbolKey: string;   // enclosing NAMED symbol (spec §6.2)
  name: string;            // the identifier as written
  receiver: string | null; // for `x.foo()`, "x"; null for a bare `foo()`
  kind: "CALLS" | "REFERENCES" | "IMPLEMENTS" | "INHERITS";
  siteLine: number;
}

export interface ImportRecord {
  localName: string;       // name bound in this file
  importedName: string;    // name in the source module; "default" or "*" as applicable
  specifier: string;       // raw module specifier
  siteLine: number;
}

export interface ExportRecord {
  exportedName: string;       // "default" for default exports
  localName: string | null;   // null for pure re-exports
  reExportFrom: string | null;// specifier for `export ... from`
  isStar: boolean;            // `export * from`
  siteLine: number;
}

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  line: number;
}

export interface ExtractResult {
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  imports: ImportRecord[];
  exports: ExportRecord[];
  diagnostics: Diagnostic[];
}

export interface LanguageAdapter {
  readonly language: string;
  readonly extractorVersion: string;
  matches(path: string): boolean;
  /** MUST be pure: no I/O, no global state, no cross-file lookups. */
  extract(path: string, bytes: Uint8Array): ExtractResult;
}
```

- [ ] **Step 5: Implement the parser loader**

```ts
// src/adapters/typescript/parser.ts
import { Parser, Language } from "web-tree-sitter";
import { join } from "node:path";

let parserPromise: Promise<Parser> | null = null;

export async function getTsParser(): Promise<Parser> {
  parserPromise ??= (async () => {
    await Parser.init();
    const lang = await Language.load(join(process.cwd(), "vendor", "tree-sitter-typescript.wasm"));
    const p = new Parser();
    p.setLanguage(lang);
    return p;
  })();
  return parserPromise;
}
```

- [ ] **Step 6: Run tests**

Run: `node scripts/fetch-grammars.mjs && npx vitest run tests/adapters/parser.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 7: Commit**

```bash
git add src/adapters/types.ts src/adapters/typescript/parser.ts scripts/fetch-grammars.mjs tests/adapters/parser.test.ts package.json .gitignore
git commit -m "feat: add tree-sitter WASM plumbing and language adapter contract"
```

---

### Task 6: Swift spike — validate the adapter contract before TypeScript hardens

**Files:**
- Create: `spikes/swift/extract.mjs`, `spikes/swift/FINDINGS.md`
- Delete at end of task: `spikes/swift/extract.mjs`

**Interfaces:**
- Consumes: `ExtractResult` shape from Task 5
- Produces: a written finding in `docs/superpowers/specs/2026-08-16-swift-spike-findings.md`; possibly an amendment to `src/adapters/types.ts`

Spec §11. This runs **now**, before Task 7 builds the TypeScript extractor, because its purpose is to catch a wrong adapter contract while changing it is still cheap.

- [ ] **Step 1: Write the Part A probe**

```js
// spikes/swift/extract.mjs
// THROWAWAY. Answers: does per-file pure extraction survive Swift?
import { Parser, Language } from "web-tree-sitter";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DUET = process.argv[2] ?? "/Users/anish/Duet";

await Parser.init();
const lang = await Language.load(join(process.cwd(), "vendor", "tree-sitter-swift.wasm"));
const parser = new Parser();
parser.setLanguage(lang);

const files = [];
const walk = d => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "Pods") continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".swift")) files.push(p);
  }
};
walk(DUET);

const stats = {
  files: 0, parsed: 0, errors: 0,
  types: 0, extensions: 0, extensionsWithNamedType: 0,
  conformances: 0, funcs: 0,
  resultBuilderBodies: 0, propertyWrappers: 0,
};

for (const f of files.slice(0, 200)) {
  stats.files++;
  const tree = parser.parse(readFileSync(f, "utf8"));
  if (tree.rootNode.hasError) stats.errors++; else stats.parsed++;

  const visit = n => {
    switch (n.type) {
      case "class_declaration":
      case "protocol_declaration": {
        stats.types++;
        // An `extension Foo` is a class_declaration with an extension modifier in this grammar.
        const text = n.text.slice(0, 40);
        if (text.startsWith("extension")) {
          stats.extensions++;
          if (n.childForFieldName("name")) stats.extensionsWithNamedType++;
        }
        if (n.childForFieldName("inherits") || /:\s*\w/.test(text)) stats.conformances++;
        break;
      }
      case "function_declaration": stats.funcs++; break;
      case "modifiers":
        if (/@\w+/.test(n.text)) stats.propertyWrappers++;
        break;
      case "call_expression":
        if (n.text.includes("{") && /VStack|HStack|ZStack|Group|List/.test(n.text)) {
          stats.resultBuilderBodies++;
        }
        break;
    }
    for (let i = 0; i < n.childCount; i++) visit(n.child(i));
  };
  visit(tree.rootNode);
}

console.log(JSON.stringify(stats, null, 2));
```

- [ ] **Step 2: Run Part A**

Run: `node spikes/swift/extract.mjs /Users/anish/Duet`
Expected: JSON stats. Record them.

Evaluate the three pass criteria from spec §11:
1. `extensionsWithNamedType / extensions` ≥ 0.95 — extensions attributable from single-file syntax
2. `errors / files` ≤ 0.05 with `resultBuilderBodies > 0` and `propertyWrappers > 0` — builders and wrappers do not break boundaries
3. No field needed that `ExtractResult` cannot express

- [ ] **Step 3: Run Part B — the resolution paper exercise**

This is the part that matters. Swift's module-wide `internal` default means **there are no imports to narrow same-module references** (spec §11).

Pick 20 real references from the Duet slice — a mix of bare calls, member calls, and protocol method calls. For each, hand-compute what `src/resolve/tiers.ts` (Task 11) would assign given: no import table, a global symbol table for the module, and the §4.3 rules.

Record in a table: reference text, candidate count, tier that would be assigned.

- [ ] **Step 4: Write the findings document**

Create `docs/superpowers/specs/2026-08-16-swift-spike-findings.md` with: Part A stats, Part A pass/fail per criterion, Part B's 20-row table, tier distribution, and a verdict.

**Decision rule:** if Part B shows >60% of references landing in `HEURISTIC` with `candidate_count > 3`, the import-centric narrowing in `ReferenceRecord`/`tiers.ts` is insufficient for Swift. Amend `src/adapters/types.ts` **now** to carry an optional `scopeHint: string | null` (SwiftPM target or file-level access modifier), so the TypeScript adapter is built against a contract that can express module scope without imports.

- [ ] **Step 5: Delete the throwaway code, keep the findings**

```bash
rm -rf spikes/
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-16-swift-spike-findings.md src/adapters/types.ts
git commit -m "docs: record Swift spike findings and amend adapter contract"
```

---

### Task 7: TypeScript symbol extraction and stable keys

**Files:**
- Create: `src/adapters/typescript/symbols.ts`, `tests/adapters/symbols.test.ts`
- Create: `tests/fixtures/ts/symbols-basic.ts`

**Interfaces:**
- Consumes: `getTsParser` (Task 5), `SymbolRecord` (Task 5)
- Produces: `function extractSymbols(path: string, source: string, tree: Tree): SymbolRecord[]`, `function stableKey(path: string, scopeChain: string[], sigHash?: string): string`

Implements spec §6.2 exactly. The rules are unusual and every one has a test.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/symbols.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getTsParser } from "../../src/adapters/typescript/parser.js";
import { extractSymbols } from "../../src/adapters/typescript/symbols.js";

const run = async (src: string) =>
  extractSymbols("src/a.ts", src, (await getTsParser()).parse(src));

describe("extractSymbols", () => {
  it("extracts an exported function with a stable key", async () => {
    const s = await run("export function foo(a: number): void {}");
    expect(s).toHaveLength(1);
    expect(s[0]!.stableKey).toBe("ts:src/a.ts#foo");
    expect(s[0]!.kind).toBe("function");
    expect(s[0]!.exported).toBe(true);
  });

  it("mints arrow functions bound to a name as functions", async () => {
    const s = await run("const foo = () => {};");
    expect(s.map(x => x.shortName)).toContain("foo");
    expect(s.find(x => x.shortName === "foo")!.kind).toBe("function");
  });

  it("does NOT mint anonymous callbacks as symbols", async () => {
    const s = await run("function outer() { [1].map(x => x + 1); }");
    expect(s).toHaveLength(1);
    expect(s[0]!.shortName).toBe("outer");
  });

  it("scopes methods under their class", async () => {
    const s = await run("export class Auth { refresh(): void {} }");
    const keys = s.map(x => x.stableKey);
    expect(keys).toContain("ts:src/a.ts#Auth");
    expect(keys).toContain("ts:src/a.ts#Auth.refresh");
  });

  it("keys a default-exported anonymous class as #default", async () => {
    const s = await run("export default class {}");
    expect(s[0]!.stableKey).toBe("ts:src/a.ts#default");
  });

  it("strips type parameters from the key but keeps them in the signature", async () => {
    const s = await run("export function map<T>(x: T): T { return x; }");
    expect(s[0]!.stableKey).toBe("ts:src/a.ts#map");
    expect(s[0]!.signature).toContain("<T>");
  });

  it("disambiguates same-name symbols with a signature hash", async () => {
    const s = await run(`
      function helper(a: number): void {}
      export class K { m() { function helper(b: string): void {} } }
    `);
    const keys = s.filter(x => x.shortName === "helper").map(x => x.stableKey);
    expect(new Set(keys).size).toBe(keys.length); // no collisions
  });

  it("marks test symbols", async () => {
    const src = "describe('x', () => { it('works', () => {}); });";
    const s = extractSymbols("src/a.test.ts", src, (await getTsParser()).parse(src));
    expect(s.every(x => x.isTest)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adapters/symbols.test.ts`
Expected: FAIL — cannot resolve `symbols.js`

- [ ] **Step 3: Implement**

```ts
// src/adapters/typescript/symbols.ts
import { createHash } from "node:crypto";
import type { Tree, SyntaxNode } from "web-tree-sitter";
import type { SymbolRecord } from "../types.js";
import type { SymbolKind } from "../../store/repos.js";

const TEST_PATH = /(\.test\.|\.spec\.|(^|\/)__tests__\/)/;

export function stableKey(path: string, scopeChain: string[], sigHash?: string): string {
  const chain = scopeChain.join(".");
  return `ts:${path}#${chain}${sigHash ? `~${sigHash}` : ""}`;
}

function sigHash8(sig: string): string {
  return createHash("sha256").update(sig).digest("hex").slice(0, 8);
}

/** Type params are stripped from identity but kept in the signature (spec §6.2). */
function signatureOf(node: SyntaxNode, source: string): string {
  const body = node.childForFieldName("body");
  const end = body ? body.startIndex : node.endIndex;
  return source.slice(node.startIndex, end).replace(/\s+/g, " ").trim();
}

function isExported(node: SyntaxNode): boolean {
  let n: SyntaxNode | null = node;
  while (n) {
    if (n.type === "export_statement") return true;
    n = n.parent;
  }
  return false;
}

export function extractSymbols(path: string, source: string, tree: Tree): SymbolRecord[] {
  const out: SymbolRecord[] = [];
  const fileIsTest = TEST_PATH.test(path);
  const seen = new Map<string, number>();

  const push = (
    node: SyntaxNode, name: string, kind: SymbolKind, chain: string[], isTest: boolean,
  ): void => {
    const sig = signatureOf(node, source);
    const base = stableKey(path, chain);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    // First occupant keeps the bare key; later collisions gain a signature hash (spec §6.2).
    const key = n === 1 ? base : stableKey(path, chain, sigHash8(sig + String(n)));

    out.push({
      stableKey: key,
      qualifiedName: chain.join("."),
      shortName: name,
      kind,
      signature: sig,
      startByte: node.startIndex,
      endByte: node.endIndex,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      bodyHash: createHash("sha256").update(source.slice(node.startIndex, node.endIndex)).digest("hex"),
      exported: isExported(node),
      isTest: isTest || fileIsTest,
    });
  };

  const nameOf = (n: SyntaxNode): string | null =>
    n.childForFieldName("name")?.text ?? null;

  const visit = (node: SyntaxNode, chain: string[]): void => {
    let nextChain = chain;

    switch (node.type) {
      case "function_declaration": {
        const nm = nameOf(node);
        if (nm) { nextChain = [...chain, nm]; push(node, nm, "function", nextChain, false); }
        break;
      }
      case "class_declaration": {
        const nm = nameOf(node) ?? (isExported(node) ? "default" : null);
        if (nm) { nextChain = [...chain, nm]; push(node, nm, "class", nextChain, false); }
        break;
      }
      case "interface_declaration": {
        const nm = nameOf(node);
        if (nm) { nextChain = [...chain, nm]; push(node, nm, "interface", nextChain, false); }
        break;
      }
      case "type_alias_declaration": {
        const nm = nameOf(node);
        if (nm) push(node, nm, "type", [...chain, nm], false);
        break;
      }
      case "enum_declaration": {
        const nm = nameOf(node);
        if (nm) { nextChain = [...chain, nm]; push(node, nm, "enum", nextChain, false); }
        break;
      }
      case "method_definition": {
        const nm = nameOf(node);
        if (nm) { nextChain = [...chain, nm]; push(node, nm, "method", nextChain, false); }
        break;
      }
      case "variable_declarator": {
        // `const foo = () => {}` is a function; anything else is a variable.
        const nm = nameOf(node);
        const value = node.childForFieldName("value");
        if (nm) {
          const isFn = value?.type === "arrow_function" || value?.type === "function_expression";
          nextChain = [...chain, nm];
          push(node, nm, isFn ? "function" : "variable", nextChain, false);
        }
        break;
      }
      // Anonymous callbacks are deliberately NOT minted (spec §6.2). References
      // inside them attribute to the nearest named enclosing symbol, which is
      // achieved by not extending `chain` here.
      default: break;
    }

    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i)!, nextChain);
    }
  };

  visit(tree.rootNode, []);
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/adapters/symbols.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/adapters/typescript/symbols.ts tests/adapters/symbols.test.ts
git commit -m "feat: extract TypeScript symbols with spec-compliant stable keys"
```

---

### Task 8: Reference and module-table extraction

**Files:**
- Create: `src/adapters/typescript/references.ts`, `src/adapters/typescript/modules.ts`, `src/adapters/typescript/index.ts`
- Create: `tests/adapters/references.test.ts`, `tests/adapters/modules.test.ts`

**Interfaces:**
- Consumes: `extractSymbols` (Task 7), `ReferenceRecord`/`ImportRecord`/`ExportRecord` (Task 5)
- Produces:
  - `function extractReferences(path, source, tree, symbols): ReferenceRecord[]`
  - `function extractModuleTables(source, tree): { imports: ImportRecord[]; exports: ExportRecord[] }`
  - `const typescriptAdapter: LanguageAdapter`

The `receiver` field is what lets Task 11 keep member-access calls out of `LEXICAL` (spec §4.3).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/adapters/references.test.ts
import { describe, it, expect } from "vitest";
import { getTsParser } from "../../src/adapters/typescript/parser.js";
import { extractSymbols } from "../../src/adapters/typescript/symbols.js";
import { extractReferences } from "../../src/adapters/typescript/references.js";

const run = async (src: string, path = "src/a.ts") => {
  const tree = (await getTsParser()).parse(src);
  return extractReferences(path, src, tree, extractSymbols(path, src, tree));
};

describe("extractReferences", () => {
  it("records a bare call with a null receiver", async () => {
    const r = await run("function a() { helper(); }");
    const call = r.find(x => x.name === "helper")!;
    expect(call.kind).toBe("CALLS");
    expect(call.receiver).toBeNull();
    expect(call.fromSymbolKey).toBe("ts:src/a.ts#a");
  });

  it("records a member call with its receiver", async () => {
    const r = await run("function a() { svc.refresh(); }");
    const call = r.find(x => x.name === "refresh")!;
    expect(call.receiver).toBe("svc");
  });

  it("attributes references inside anonymous callbacks to the nearest named symbol", async () => {
    const r = await run("function outer() { [1].map(x => helper(x)); }");
    expect(r.find(x => x.name === "helper")!.fromSymbolKey).toBe("ts:src/a.ts#outer");
  });

  it("records a callback passed by reference as REFERENCES, not CALLS", async () => {
    const r = await run("function a() { [1].map(handler); }");
    const ref = r.find(x => x.name === "handler")!;
    expect(ref.kind).toBe("REFERENCES");
  });

  it("records class inheritance and interface implementation", async () => {
    const r = await run("class A extends B implements C {}");
    expect(r.find(x => x.name === "B")!.kind).toBe("INHERITS");
    expect(r.find(x => x.name === "C")!.kind).toBe("IMPLEMENTS");
  });
});
```

```ts
// tests/adapters/modules.test.ts
import { describe, it, expect } from "vitest";
import { getTsParser } from "../../src/adapters/typescript/parser.js";
import { extractModuleTables } from "../../src/adapters/typescript/modules.js";

const run = async (src: string) => extractModuleTables(src, (await getTsParser()).parse(src));

describe("extractModuleTables", () => {
  it("records named imports", async () => {
    const { imports } = await run(`import { foo } from "./a";`);
    expect(imports[0]).toMatchObject({ localName: "foo", importedName: "foo", specifier: "./a" });
  });

  it("records aliased imports", async () => {
    const { imports } = await run(`import { foo as bar } from "./a";`);
    expect(imports[0]).toMatchObject({ localName: "bar", importedName: "foo" });
  });

  it("records default imports", async () => {
    const { imports } = await run(`import Thing from "./a";`);
    expect(imports[0]).toMatchObject({ localName: "Thing", importedName: "default" });
  });

  it("records namespace imports", async () => {
    const { imports } = await run(`import * as ns from "./a";`);
    expect(imports[0]).toMatchObject({ localName: "ns", importedName: "*" });
  });

  it("records star re-exports for the fixpoint", async () => {
    const { exports } = await run(`export * from "./a";`);
    expect(exports[0]).toMatchObject({ isStar: true, reExportFrom: "./a" });
  });

  it("records named re-exports", async () => {
    const { exports } = await run(`export { foo } from "./a";`);
    expect(exports[0]).toMatchObject({ exportedName: "foo", reExportFrom: "./a", isStar: false });
  });

  it("records local named exports", async () => {
    const { exports } = await run(`export function foo() {}`);
    expect(exports[0]).toMatchObject({ exportedName: "foo", reExportFrom: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/adapters/references.test.ts tests/adapters/modules.test.ts`
Expected: FAIL — cannot resolve the modules

- [ ] **Step 3: Implement reference extraction**

```ts
// src/adapters/typescript/references.ts
import type { Tree, SyntaxNode } from "web-tree-sitter";
import type { ReferenceRecord, SymbolRecord } from "../types.js";

/** Nearest named enclosing symbol by byte containment (spec §6.2). */
function enclosing(symbols: SymbolRecord[], offset: number): string | null {
  let best: SymbolRecord | null = null;
  for (const s of symbols) {
    if (offset >= s.startByte && offset < s.endByte) {
      if (!best || s.startByte > best.startByte) best = s;
    }
  }
  return best?.stableKey ?? null;
}

export function extractReferences(
  path: string, source: string, tree: Tree, symbols: SymbolRecord[],
): ReferenceRecord[] {
  const out: ReferenceRecord[] = [];

  const add = (
    node: SyntaxNode, name: string, receiver: string | null, kind: ReferenceRecord["kind"],
  ): void => {
    const from = enclosing(symbols, node.startIndex);
    if (!from) return; // top-level statements outside any symbol
    out.push({ fromSymbolKey: from, name, receiver, kind, siteLine: node.startPosition.row + 1 });
  };

  const visit = (node: SyntaxNode): void => {
    switch (node.type) {
      case "call_expression": {
        const fn = node.childForFieldName("function");
        if (fn?.type === "identifier") {
          add(fn, fn.text, null, "CALLS");
        } else if (fn?.type === "member_expression") {
          const prop = fn.childForFieldName("property");
          const obj = fn.childForFieldName("object");
          if (prop) add(prop, prop.text, obj?.text ?? null, "CALLS");
        }
        // Function-valued arguments are REFERENCES, not CALLS (spec §6.1).
        const args = node.childForFieldName("arguments");
        if (args) {
          for (let i = 0; i < args.childCount; i++) {
            const a = args.child(i)!;
            if (a.type === "identifier") add(a, a.text, null, "REFERENCES");
          }
        }
        break;
      }
      case "class_heritage": {
        for (let i = 0; i < node.childCount; i++) {
          const c = node.child(i)!;
          if (c.type === "extends_clause") {
            for (let j = 0; j < c.childCount; j++) {
              const t = c.child(j)!;
              if (t.type === "identifier") add(t, t.text, null, "INHERITS");
            }
          }
          if (c.type === "implements_clause") {
            for (let j = 0; j < c.childCount; j++) {
              const t = c.child(j)!;
              if (t.type === "type_identifier" || t.type === "identifier") {
                add(t, t.text, null, "IMPLEMENTS");
              }
            }
          }
        }
        break;
      }
      default: break;
    }
    for (let i = 0; i < node.childCount; i++) visit(node.child(i)!);
  };

  visit(tree.rootNode);
  return out;
}
```

- [ ] **Step 4: Implement module table extraction**

```ts
// src/adapters/typescript/modules.ts
import type { Tree, SyntaxNode } from "web-tree-sitter";
import type { ImportRecord, ExportRecord } from "../types.js";

const unquote = (s: string): string => s.replace(/^['"`]|['"`]$/g, "");

export function extractModuleTables(
  source: string, tree: Tree,
): { imports: ImportRecord[]; exports: ExportRecord[] } {
  const imports: ImportRecord[] = [];
  const exports: ExportRecord[] = [];

  const visit = (node: SyntaxNode): void => {
    const line = node.startPosition.row + 1;

    if (node.type === "import_statement") {
      const spec = node.childForFieldName("source");
      const specifier = spec ? unquote(spec.text) : "";
      const clause = node.namedChildren.find(c => c.type === "import_clause");
      if (clause) {
        for (const c of clause.namedChildren) {
          if (c.type === "identifier") {
            imports.push({ localName: c.text, importedName: "default", specifier, siteLine: line });
          } else if (c.type === "namespace_import") {
            const id = c.namedChildren.find(x => x.type === "identifier");
            if (id) imports.push({ localName: id.text, importedName: "*", specifier, siteLine: line });
          } else if (c.type === "named_imports") {
            for (const s of c.namedChildren) {
              if (s.type !== "import_specifier") continue;
              const name = s.childForFieldName("name")?.text ?? "";
              const alias = s.childForFieldName("alias")?.text;
              imports.push({ localName: alias ?? name, importedName: name, specifier, siteLine: line });
            }
          }
        }
      }
    }

    if (node.type === "export_statement") {
      const spec = node.childForFieldName("source");
      const from = spec ? unquote(spec.text) : null;
      const named = node.namedChildren.find(c => c.type === "export_clause");

      if (!named && from) {
        exports.push({ exportedName: "*", localName: null, reExportFrom: from, isStar: true, siteLine: line });
      } else if (named) {
        for (const s of named.namedChildren) {
          if (s.type !== "export_specifier") continue;
          const name = s.childForFieldName("name")?.text ?? "";
          const alias = s.childForFieldName("alias")?.text;
          exports.push({
            exportedName: alias ?? name,
            localName: from ? null : name,
            reExportFrom: from, isStar: false, siteLine: line,
          });
        }
      } else {
        const decl = node.childForFieldName("declaration");
        const nm = decl?.childForFieldName("name")?.text
          ?? (node.text.includes("export default") ? "default" : null);
        if (nm) {
          exports.push({ exportedName: nm, localName: nm, reExportFrom: null, isStar: false, siteLine: line });
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) visit(node.child(i)!);
  };

  visit(tree.rootNode);
  return { imports, exports };
}
```

- [ ] **Step 5: Assemble the adapter**

```ts
// src/adapters/typescript/index.ts
import type { LanguageAdapter, ExtractResult } from "../types.js";
import { EXTRACTOR_VERSION } from "../../version.js";
import { getTsParserSync } from "./parser.js";
import { extractSymbols } from "./symbols.js";
import { extractReferences } from "./references.js";
import { extractModuleTables } from "./modules.js";

export const typescriptAdapter: LanguageAdapter = {
  language: "typescript",
  extractorVersion: EXTRACTOR_VERSION,
  matches: (p) => /\.(ts|tsx|mts|cts)$/.test(p) && !p.endsWith(".d.ts"),
  extract(path, bytes): ExtractResult {
    const source = Buffer.from(bytes).toString("utf8");
    const tree = getTsParserSync().parse(source);
    const symbols = extractSymbols(path, source, tree);
    const { imports, exports } = extractModuleTables(source, tree);
    return {
      symbols,
      references: extractReferences(path, source, tree, symbols),
      imports,
      exports,
      diagnostics: tree.rootNode.hasError
        ? [{ severity: "warning", message: "parse errors present", line: 1 }]
        : [],
    };
  },
};
```

Add `getTsParserSync` to `src/adapters/typescript/parser.ts` (throws if `getTsParser()` has not been awaited once — keeps `extract` pure and synchronous):

```ts
let cached: Parser | null = null;
export function getTsParserSync(): Parser {
  if (!cached) throw new Error("call await getTsParser() once before extract()");
  return cached;
}
```
…and set `cached = p` inside the `getTsParser` initializer before returning.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/adapters/`
Expected: PASS, all adapter tests

- [ ] **Step 7: Commit**

```bash
git add src/adapters/typescript tests/adapters
git commit -m "feat: extract references and module tables; assemble TypeScript adapter"
```

---

### Task 9: tsconfig loading and module specifier resolution

**Files:**
- Create: `src/tsconfig/load.ts`, `src/tsconfig/resolve.ts`, `tests/tsconfig/resolve.test.ts`

**Interfaces:**
- Consumes: `RepoBoundary` (Task 2)
- Produces:
  - `interface TsConfig { baseUrl: string | null; paths: Record<string, string[]>; moduleResolution: string; }`
  - `function loadTsConfig(boundary: RepoBoundary): TsConfig`
  - `function resolveSpecifier(spec: string, fromFile: string, cfg: TsConfig, boundary: RepoBoundary): { kind: "internal"; path: string } | { kind: "external"; pkg: string }`

Spec §4.2 job 1. **`node_modules` is readable here even though it is not indexed** — enforced by a test.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tsconfig/resolve.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { loadTsConfig } from "../../src/tsconfig/load.js";
import { resolveSpecifier } from "../../src/tsconfig/resolve.js";

let root: string, boundary: RepoBoundary, cfg: ReturnType<typeof loadTsConfig>;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cg-tsc-"));
  mkdirSync(join(root, "src", "auth"), { recursive: true });
  mkdirSync(join(root, "node_modules", "left-pad"), { recursive: true });
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"] }, moduleResolution: "bundler" },
  }));
  writeFileSync(join(root, "src", "a.ts"), "");
  writeFileSync(join(root, "src", "auth", "index.ts"), "");
  writeFileSync(join(root, "src", "auth", "session.ts"), "");
  writeFileSync(join(root, "node_modules", "left-pad", "package.json"), "{}");
  boundary = new RepoBoundary(root);
  cfg = loadTsConfig(boundary);
});

describe("resolveSpecifier", () => {
  const r = (spec: string, from = "src/a.ts") => resolveSpecifier(spec, from, cfg, boundary);

  it("resolves a relative specifier with an implicit .ts extension", () => {
    expect(r("./auth/session")).toEqual({ kind: "internal", path: "src/auth/session.ts" });
  });

  it("resolves a directory to its index file", () => {
    expect(r("./auth")).toEqual({ kind: "internal", path: "src/auth/index.ts" });
  });

  it("resolves a tsconfig path alias", () => {
    expect(r("@app/auth/session")).toEqual({ kind: "internal", path: "src/auth/session.ts" });
  });

  it("resolves a .js specifier to the .ts file under bundler resolution", () => {
    expect(r("./auth/session.js")).toEqual({ kind: "internal", path: "src/auth/session.ts" });
  });

  it("classifies a bare package specifier as external", () => {
    expect(r("left-pad")).toEqual({ kind: "external", pkg: "left-pad" });
  });

  it("classifies an unresolvable relative specifier as external rather than guessing", () => {
    expect(r("./nope")).toEqual({ kind: "external", pkg: "./nope" });
  });

  it("reads node_modules as resolution input even though it is never indexed", () => {
    // left-pad exists only under node_modules; classifying it requires reading that tree.
    expect(r("left-pad").kind).toBe("external");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tsconfig/resolve.test.ts`
Expected: FAIL — cannot resolve the modules

- [ ] **Step 3: Implement loading**

```ts
// src/tsconfig/load.ts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve as pres } from "node:path";
import type { RepoBoundary } from "../repo/boundary.js";

export interface TsConfig {
  baseUrl: string | null;                 // absolute
  paths: Record<string, string[]>;
  moduleResolution: string;
}

/** Strips comments and trailing commas — tsconfig.json is JSONC. */
function parseJsonc(text: string): any {
  const noComments = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, "$1"));
}

export function loadTsConfig(boundary: RepoBoundary): TsConfig {
  const merged: TsConfig = { baseUrl: null, paths: {}, moduleResolution: "node" };
  const start = join(boundary.root, "tsconfig.json");
  if (!existsSync(start)) return merged;

  const seen = new Set<string>();
  const load = (abs: string): void => {
    if (seen.has(abs) || !existsSync(abs)) return;
    seen.add(abs);
    const cfg = parseJsonc(readFileSync(abs, "utf8"));

    // `extends` is applied first so the local file wins.
    if (typeof cfg.extends === "string") {
      const ext = cfg.extends.startsWith(".")
        ? pres(dirname(abs), cfg.extends)
        : join(boundary.root, "node_modules", cfg.extends);
      load(ext.endsWith(".json") ? ext : `${ext}.json`);
    }

    const co = cfg.compilerOptions ?? {};
    if (co.baseUrl) merged.baseUrl = pres(dirname(abs), co.baseUrl);
    if (co.paths) Object.assign(merged.paths, co.paths);
    if (co.moduleResolution) merged.moduleResolution = String(co.moduleResolution).toLowerCase();
  };

  load(start);
  return merged;
}
```

- [ ] **Step 4: Implement resolution**

```ts
// src/tsconfig/resolve.ts
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve as pres, relative, sep } from "node:path";
import type { RepoBoundary } from "../repo/boundary.js";
import type { TsConfig } from "./load.js";

export type Resolution =
  | { kind: "internal"; path: string }
  | { kind: "external"; pkg: string };

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx"];

function probe(absNoExt: string): string | null {
  for (const ext of EXTENSIONS) {
    const p = absNoExt + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  if (existsSync(absNoExt) && statSync(absNoExt).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const p = join(absNoExt, `index${ext}`);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  return null;
}

export function resolveSpecifier(
  spec: string, fromFile: string, cfg: TsConfig, boundary: RepoBoundary,
): Resolution {
  const toInternal = (abs: string): Resolution | null => {
    if (!boundary.contains(abs)) return null;
    return { kind: "internal", path: relative(boundary.root, abs).split(sep).join("/") };
  };

  // Under node16/nodenext/bundler, `./x.js` means the `x.ts` source file.
  const candidates = [spec];
  if (/\.(js|mjs|cjs)$/.test(spec) && cfg.moduleResolution !== "node") {
    candidates.push(spec.replace(/\.(js|mjs|cjs)$/, ""));
  }

  for (const cand of candidates) {
    if (cand.startsWith(".")) {
      const hit = probe(pres(dirname(join(boundary.root, fromFile)), cand));
      if (hit) { const r = toInternal(hit); if (r) return r; }
      continue;
    }

    // tsconfig `paths` aliases
    for (const [pattern, targets] of Object.entries(cfg.paths)) {
      const re = new RegExp("^" + pattern.replace(/\*/g, "(.*)") + "$");
      const m = re.exec(cand);
      if (!m) continue;
      for (const t of targets) {
        const substituted = t.replace(/\*/g, m[1] ?? "");
        const base = cfg.baseUrl ?? boundary.root;
        const hit = probe(pres(base, substituted));
        if (hit) { const r = toInternal(hit); if (r) return r; }
      }
    }

    // baseUrl-relative non-relative import
    if (cfg.baseUrl) {
      const hit = probe(pres(cfg.baseUrl, cand));
      if (hit) { const r = toInternal(hit); if (r) return r; }
    }
  }

  // Bare package → external. Scoped packages keep both segments.
  const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
  return { kind: "external", pkg: spec.startsWith(".") ? spec : pkg };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/tsconfig/resolve.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add src/tsconfig tests/tsconfig
git commit -m "feat: add tsconfig loading and module specifier resolution"
```

---

### Task 10: LINK — cycle-safe export-map fixpoint

**Files:**
- Create: `src/link/exportmap.ts`, `src/link/imports.ts`, `tests/link/exportmap.test.ts`

**Interfaces:**
- Consumes: `ExportRecord`/`ImportRecord` (Task 5), `resolveSpecifier` (Task 9)
- Produces:
  - `function buildExportMap(files: Map<string, ExtractResult>, cfg, boundary): Map<string, Map<string, string>>` — file → (exported name → owning file)
  - `function bindImports(file: string, imports: ImportRecord[], exportMap, cfg, boundary): Map<string, { file: string; name: string } | { external: string }>`

Spec §4.2 job 2. Barrel files are why this exists; import cycles are why it must be a fixpoint.

- [ ] **Step 1: Write the failing test**

```ts
// tests/link/exportmap.test.ts
import { describe, it, expect } from "vitest";
import { buildExportMap } from "../../src/link/exportmap.js";
import type { ExtractResult } from "../../src/adapters/types.js";

const empty = { symbols: [], references: [], imports: [], diagnostics: [] };
const mk = (exports: any[]): ExtractResult => ({ ...empty, exports } as ExtractResult);

// Resolver stub: "./x" from any file → "x.ts"
const cfg = { baseUrl: null, paths: {}, moduleResolution: "bundler" } as any;
const boundary = { root: "/r", contains: () => true } as any;
const stubResolve = (spec: string) => ({ kind: "internal", path: spec.replace("./", "") + ".ts" });

describe("buildExportMap", () => {
  it("maps a local export to its own file", () => {
    const files = new Map([["a.ts", mk([{ exportedName: "foo", localName: "foo", reExportFrom: null, isStar: false, siteLine: 1 }])]]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.get("a.ts")!.get("foo")).toBe("a.ts");
  });

  it("follows a named re-export to the owning file", () => {
    const files = new Map([
      ["a.ts", mk([{ exportedName: "foo", localName: "foo", reExportFrom: null, isStar: false, siteLine: 1 }])],
      ["index.ts", mk([{ exportedName: "foo", localName: null, reExportFrom: "./a", isStar: false, siteLine: 1 }])],
    ]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.get("index.ts")!.get("foo")).toBe("a.ts");
  });

  it("expands `export * from` transitively through a barrel chain", () => {
    const files = new Map([
      ["a.ts", mk([{ exportedName: "foo", localName: "foo", reExportFrom: null, isStar: false, siteLine: 1 }])],
      ["b.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./a", isStar: true, siteLine: 1 }])],
      ["index.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./b", isStar: true, siteLine: 1 }])],
    ]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.get("index.ts")!.get("foo")).toBe("a.ts");
  });

  it("terminates on an import cycle instead of hanging", () => {
    const files = new Map([
      ["a.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./b", isStar: true, siteLine: 1 }])],
      ["b.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./a", isStar: true, siteLine: 1 }])],
    ]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.size).toBe(2); // completed without hanging
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/link/exportmap.test.ts`
Expected: FAIL — cannot resolve `exportmap.js`

- [ ] **Step 3: Implement**

```ts
// src/link/exportmap.ts
import type { ExtractResult } from "../adapters/types.js";
import type { TsConfig } from "../tsconfig/load.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { resolveSpecifier, type Resolution } from "../tsconfig/resolve.js";

export type ExportMap = Map<string, Map<string, string>>; // file → (name → owning file)

type ResolveFn = (spec: string, from: string, cfg: TsConfig, b: RepoBoundary) => Resolution;

/**
 * Computes each module's export set. `export * from` makes this a fixpoint over
 * the module graph; barrels routinely form cycles, so iterate to stability with
 * a bounded pass count rather than recursing (spec §4.2).
 */
export function buildExportMap(
  files: Map<string, ExtractResult>,
  cfg: TsConfig,
  boundary: RepoBoundary,
  resolveFn: ResolveFn = resolveSpecifier,
): ExportMap {
  const map: ExportMap = new Map();
  for (const f of files.keys()) map.set(f, new Map());

  // Pass 1: local exports and named re-exports (direct targets only).
  for (const [file, res] of files) {
    const own = map.get(file)!;
    for (const e of res.exports) {
      if (e.isStar) continue;
      if (!e.reExportFrom) { own.set(e.exportedName, file); continue; }
      const t = resolveFn(e.reExportFrom, file, cfg, boundary);
      if (t.kind === "internal") own.set(e.exportedName, t.path);
    }
  }

  // Pass 2..N: propagate star re-exports until stable.
  const MAX_PASSES = 20;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const [file, res] of files) {
      const own = map.get(file)!;
      for (const e of res.exports) {
        if (!e.isStar || !e.reExportFrom) continue;
        const t = resolveFn(e.reExportFrom, file, cfg, boundary);
        if (t.kind !== "internal") continue;
        const src = map.get(t.path);
        if (!src) continue;
        for (const [name, owner] of src) {
          if (name === "default") continue; // `export *` never re-exports default
          if (!own.has(name)) { own.set(name, owner); changed = true; }
        }
      }
    }
    if (!changed) break;
  }

  // Pass N+1: resolve named re-exports that pointed at a barrel.
  for (const [file, res] of files) {
    const own = map.get(file)!;
    for (const e of res.exports) {
      if (e.isStar || !e.reExportFrom) continue;
      const t = resolveFn(e.reExportFrom, file, cfg, boundary);
      if (t.kind !== "internal") continue;
      const owner = map.get(t.path)?.get(e.exportedName);
      if (owner) own.set(e.exportedName, owner);
    }
  }

  return map;
}
```

```ts
// src/link/imports.ts
import type { ImportRecord } from "../adapters/types.js";
import type { TsConfig } from "../tsconfig/load.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { resolveSpecifier } from "../tsconfig/resolve.js";
import type { ExportMap } from "./exportmap.js";

export type Binding = { file: string; name: string } | { external: string };

/** localName → where it actually comes from. */
export function bindImports(
  file: string, imports: ImportRecord[], exportMap: ExportMap,
  cfg: TsConfig, boundary: RepoBoundary,
): Map<string, Binding> {
  const out = new Map<string, Binding>();
  for (const imp of imports) {
    const t = resolveSpecifier(imp.specifier, file, cfg, boundary);
    if (t.kind === "external") { out.set(imp.localName, { external: t.pkg }); continue; }
    if (imp.importedName === "*") { out.set(imp.localName, { file: t.path, name: "*" }); continue; }
    const owner = exportMap.get(t.path)?.get(imp.importedName) ?? t.path;
    out.set(imp.localName, { file: owner, name: imp.importedName });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/link/exportmap.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/link tests/link
git commit -m "feat: add cycle-safe export-map fixpoint and import binding"
```

---

### Task 11: The tsc oracle — built before the resolver

**Files:**
- Create: `bench/oracle/program.ts`, `bench/oracle/ancestry.ts`, `bench/oracle/extract.ts`, `bench/oracle/compare.ts`, `tests/oracle/oracle.test.ts`
- Create: `tests/fixtures/repos/small/` (a 6-file TypeScript fixture with a barrel, a class hierarchy, and a test file)

**Interfaces:**
- Consumes: `tsconfig` fixture layout only. **Deliberately consumes nothing from `src/`** — see below.
- Produces:
  - `interface OracleEdge { srcFile: string; srcSymbol: string; dstFile: string; dstSymbol: string; kind: "CALLS" | "REFERENCES" | "INHERITS" | "IMPLEMENTS"; }`
  - `function buildOracle(fixtureRoot: string): OracleEdge[]`
  - `function compare(actual: OracleEdge[], expected: OracleEdge[]): Report`

Spec §10 Layer 2. Two rules are non-negotiable:

1. **`ancestry.ts` must map positions to enclosing symbols using `tsc`'s own AST**, never Sonde's containment logic. Sharing that code would make a containment bug produce correlated errors and the oracle would silently agree with the bug it exists to catch.
2. **Filter to in-repo targets.** `tsc` resolves into `node_modules` and `lib.d.ts`; Sonde deliberately does not. Unfiltered recall would be meaningless.

- [ ] **Step 1: Create the fixture repo**

```
tests/fixtures/repos/small/
  tsconfig.json          { "compilerOptions": { "strict": true, "moduleResolution": "bundler" } }
  src/index.ts           export * from "./auth";
  src/auth/index.ts      export { SessionManager } from "./session";
  src/auth/session.ts    export class SessionManager extends Base implements Refreshable { refresh() { return validate(this.token); } }
  src/auth/base.ts       export class Base { protected token = ""; }
  src/util/validate.ts   export function validate(t: string): boolean { return t.length > 0; }
  src/auth/session.test.ts  import { SessionManager } from "./session"; describe("s", () => { it("refreshes", () => { new SessionManager().refresh(); }); });
```

Write these files exactly; the oracle test asserts specific edges from them.

- [ ] **Step 2: Write the failing test**

```ts
// tests/oracle/oracle.test.ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { buildOracle } from "../../bench/oracle/extract.js";
import { compare } from "../../bench/oracle/compare.js";

const FIXTURE = join(process.cwd(), "tests/fixtures/repos/small");

describe("tsc oracle", () => {
  const edges = buildOracle(FIXTURE);

  it("finds the cross-file call from refresh to validate", () => {
    expect(edges).toContainEqual(expect.objectContaining({
      srcSymbol: "SessionManager.refresh", dstSymbol: "validate", kind: "CALLS",
    }));
  });

  it("finds the inheritance edge", () => {
    expect(edges).toContainEqual(expect.objectContaining({
      srcSymbol: "SessionManager", dstSymbol: "Base", kind: "INHERITS",
    }));
  });

  it("excludes targets outside the repo", () => {
    // `describe`/`it` come from ambient test typings, never from repo source.
    expect(edges.every(e => !e.dstFile.includes("node_modules"))).toBe(true);
    expect(edges.some(e => e.dstSymbol === "describe")).toBe(false);
  });

  it("resolves a barrel-mediated import to the owning file, not the barrel", () => {
    const e = edges.find(x => x.dstSymbol === "SessionManager" && x.srcFile.endsWith(".test.ts"));
    expect(e?.dstFile).toContain("auth/session.ts");
  });

  it("computes precision and recall per kind", () => {
    const r = compare(edges.slice(0, 2), edges);
    expect(r.byKind.CALLS.recall).toBeLessThanOrEqual(1);
    expect(r.byKind.CALLS.precision).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/oracle/oracle.test.ts`
Expected: FAIL — cannot resolve `bench/oracle/extract.js`

- [ ] **Step 4: Implement the oracle**

```ts
// bench/oracle/program.ts
import ts from "typescript";
import { join } from "node:path";

export function createProgram(fixtureRoot: string): ts.Program {
  const configPath = join(fixtureRoot, "tsconfig.json");
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, fixtureRoot);
  return ts.createProgram(parsed.fileNames, parsed.options);
}
```

```ts
// bench/oracle/ancestry.ts
import ts from "typescript";

/**
 * Enclosing named symbol for a node, derived from tsc's OWN AST.
 * Deliberately does not import anything from src/ — see Task 11 rule 1.
 */
export function enclosingSymbolName(node: ts.Node): string | null {
  const chain: string[] = [];
  let n: ts.Node | undefined = node;
  while (n) {
    if (ts.isFunctionDeclaration(n) && n.name) chain.unshift(n.name.text);
    else if (ts.isClassDeclaration(n) && n.name) chain.unshift(n.name.text);
    else if (ts.isInterfaceDeclaration(n)) chain.unshift(n.name.text);
    else if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) chain.unshift(n.name.text);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const init = n.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        chain.unshift(n.name.text);
      }
    }
    n = n.parent;
  }
  return chain.length ? chain.join(".") : null;
}
```

```ts
// bench/oracle/extract.ts
import ts from "typescript";
import { relative, sep } from "node:path";
import { createProgram } from "./program.js";
import { enclosingSymbolName } from "./ancestry.js";

export interface OracleEdge {
  srcFile: string; srcSymbol: string;
  dstFile: string; dstSymbol: string;
  kind: "CALLS" | "REFERENCES" | "INHERITS" | "IMPLEMENTS";
}

export function buildOracle(fixtureRoot: string): OracleEdge[] {
  const program = createProgram(fixtureRoot);
  const checker = program.getTypeChecker();
  const out: OracleEdge[] = [];
  const rel = (f: string) => relative(fixtureRoot, f).split(sep).join("/");

  const inRepo = (f: string) => !f.includes("node_modules") && !f.endsWith(".d.ts");

  for (const sf of program.getSourceFiles()) {
    if (!inRepo(sf.fileName) || !sf.fileName.startsWith(fixtureRoot)) continue;

    const record = (node: ts.Node, target: ts.Node, kind: OracleEdge["kind"]): void => {
      const sym = checker.getSymbolAtLocation(target);
      const decl = sym?.declarations?.[0];
      if (!decl) return;
      const dstFile = decl.getSourceFile().fileName;
      if (!inRepo(dstFile)) return;                       // rule 2: in-repo targets only

      const srcSymbol = enclosingSymbolName(node);
      const dstSymbol = enclosingSymbolName(decl);
      if (!srcSymbol || !dstSymbol) return;

      out.push({ srcFile: rel(sf.fileName), srcSymbol, dstFile: rel(dstFile), dstSymbol, kind });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const target = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name : node.expression;
        record(node, target, "CALLS");
      } else if (ts.isHeritageClause(node)) {
        const kind = node.token === ts.SyntaxKind.ExtendsKeyword ? "INHERITS" : "IMPLEMENTS";
        for (const t of node.types) record(node, t.expression, kind);
      } else if (ts.isIdentifier(node) && !ts.isDeclarationName(node)) {
        record(node, node, "REFERENCES");
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // Dedupe: Sonde stores symbol→symbol pairs, not identifier positions.
  const key = (e: OracleEdge) => `${e.srcFile}|${e.srcSymbol}|${e.dstFile}|${e.dstSymbol}|${e.kind}`;
  return [...new Map(out.map(e => [key(e), e])).values()];
}
```

```ts
// bench/oracle/compare.ts
import type { OracleEdge } from "./extract.js";

export interface KindScore { precision: number; recall: number; tp: number; fp: number; fn: number; }
export interface Report { byKind: Record<string, KindScore>; overall: KindScore; }

const key = (e: OracleEdge) => `${e.srcFile}|${e.srcSymbol}|${e.dstFile}|${e.dstSymbol}|${e.kind}`;

function score(actual: OracleEdge[], expected: OracleEdge[]): KindScore {
  const a = new Set(actual.map(key));
  const e = new Set(expected.map(key));
  let tp = 0;
  for (const k of a) if (e.has(k)) tp++;
  const fp = a.size - tp;
  const fn = e.size - tp;
  return {
    tp, fp, fn,
    precision: a.size === 0 ? 1 : tp / a.size,
    recall: e.size === 0 ? 1 : tp / e.size,
  };
}

export function compare(actual: OracleEdge[], expected: OracleEdge[]): Report {
  const kinds = [...new Set([...actual, ...expected].map(x => x.kind))];
  const byKind: Record<string, KindScore> = {};
  for (const k of kinds) {
    byKind[k] = score(actual.filter(x => x.kind === k), expected.filter(x => x.kind === k));
  }
  return { byKind, overall: score(actual, expected) };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/oracle/oracle.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add bench/oracle tests/oracle tests/fixtures/repos
git commit -m "feat: add tsc oracle with independent ancestry mapping and in-repo filtering"
```

---

### Task 12: RESOLVE — evidence tiers

**Files:**
- Create: `src/resolve/symboltable.ts`, `src/resolve/tiers.ts`, `src/resolve/resolver.ts`, `tests/resolve/tiers.test.ts`

**Interfaces:**
- Consumes: `bindImports` (Task 10), `ReferenceRecord` (Task 5), `SymbolRecord` (Task 7)
- Produces:
  - `function resolveAll(files, exportMap, cfg, boundary): { edges: EdgeRow[]; external: ExternalRow[]; unresolved: UnresolvedRow[] }`
  - `function assignTier(ref, candidates, binding): { tier: Tier; confidence: number }`
- Note: `TESTS` edges are **not** produced here — Task 16 adds them to `resolveAll`'s output.

Spec §4.3. **The rule that matters: a reference with a non-null `receiver` is never `LEXICAL`.**

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolve/tiers.test.ts
import { describe, it, expect } from "vitest";
import { assignTier } from "../../src/resolve/tiers.js";

const ref = (over: Partial<any> = {}) => ({
  fromSymbolKey: "ts:a.ts#caller", name: "foo", receiver: null,
  kind: "CALLS" as const, siteLine: 1, ...over,
});
const cand = (n: number) => Array.from({ length: n }, (_, i) => ({ stableKey: `ts:b.ts#foo${i}` }));

describe("assignTier", () => {
  it("assigns LEXICAL to a bare call bound through an import", () => {
    const r = assignTier(ref(), cand(1), { file: "b.ts", name: "foo" });
    expect(r).toEqual({ tier: "LEXICAL", confidence: 1.0 });
  });

  it("assigns LEXICAL to a bare call with exactly one repo-wide candidate", () => {
    expect(assignTier(ref(), cand(1), null).tier).toBe("LEXICAL");
  });

  it("NEVER assigns LEXICAL to a member call, even with one candidate", () => {
    const r = assignTier(ref({ receiver: "svc" }), cand(1), null);
    expect(r.tier).toBe("HEURISTIC");
    expect(r.confidence).toBe(1.0);
  });

  it("assigns HEURISTIC with 1/n confidence when ambiguous", () => {
    const r = assignTier(ref(), cand(4), null);
    expect(r.tier).toBe("HEURISTIC");
    expect(r.confidence).toBeCloseTo(0.25);
  });

  it("assigns EXTERNAL when the binding points outside the repo", () => {
    expect(assignTier(ref(), [], { external: "react" }).tier).toBe("EXTERNAL");
  });

  it("assigns UNRESOLVED when there are no candidates and no binding", () => {
    expect(assignTier(ref(), [], null).tier).toBe("UNRESOLVED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve/tiers.test.ts`
Expected: FAIL — cannot resolve `tiers.js`

- [ ] **Step 3: Implement tier assignment**

```ts
// src/resolve/tiers.ts
import type { Tier } from "../store/repos.js";
import type { ReferenceRecord } from "../adapters/types.js";
import type { Binding } from "../link/imports.js";

export interface Candidate { stableKey: string; }

/**
 * Tier is determined by HOW the target was found, not by how confident it feels.
 *
 * The critical rule (spec §4.3): a member-access call `x.foo()` requires type
 * inference to resolve. Tree-sitter has no types, so a single visible `foo` is
 * NOT evidence that this call reaches it. Member access is always HEURISTIC.
 */
export function assignTier(
  ref: ReferenceRecord,
  candidates: Candidate[],
  binding: Binding | null,
): { tier: Tier; confidence: number } {
  if (binding && "external" in binding) return { tier: "EXTERNAL", confidence: 1.0 };
  if (candidates.length === 0) return { tier: "UNRESOLVED", confidence: 0 };

  const memberAccess = ref.receiver !== null;
  if (memberAccess) {
    return { tier: "HEURISTIC", confidence: 1 / candidates.length };
  }

  // Bare identifier: an import binding, or a single repo-wide candidate,
  // is genuine lexical-scope evidence.
  if (binding && "file" in binding) return { tier: "LEXICAL", confidence: 1.0 };
  if (candidates.length === 1) return { tier: "LEXICAL", confidence: 1.0 };

  return { tier: "HEURISTIC", confidence: 1 / candidates.length };
}
```

- [ ] **Step 4: Implement the symbol table and resolver**

```ts
// src/resolve/symboltable.ts
import type { SymbolRecord } from "../adapters/types.js";

export class SymbolTable {
  private byShortName = new Map<string, SymbolRecord[]>();
  private byFileAndName = new Map<string, SymbolRecord>();

  add(file: string, s: SymbolRecord): void {
    const list = this.byShortName.get(s.shortName) ?? [];
    list.push(s);
    this.byShortName.set(s.shortName, list);
    this.byFileAndName.set(`${file}|${s.shortName}`, s);
  }

  candidates(name: string): SymbolRecord[] { return this.byShortName.get(name) ?? []; }
  inFile(file: string, name: string): SymbolRecord | undefined {
    return this.byFileAndName.get(`${file}|${name}`);
  }
}
```

```ts
// src/resolve/resolver.ts
import type { ExtractResult } from "../adapters/types.js";
import type { EdgeRow } from "../store/repos.js";
import type { TsConfig } from "../tsconfig/load.js";
import type { RepoBoundary } from "../repo/boundary.js";
import type { ExportMap } from "../link/exportmap.js";
import { bindImports } from "../link/imports.js";
import { SymbolTable } from "./symboltable.js";
import { assignTier } from "./tiers.js";

export interface ResolveOutput {
  edges: EdgeRow[];
  external: Array<{ srcKey: string; name: string; packageOrLib: string; siteLine: number | null }>;
  unresolved: Array<{
    srcKey: string; name: string; kind: string; siteLine: number | null;
    candidateCount: number; reason: string;
  }>;
}

export function resolveAll(
  files: Map<string, ExtractResult>, exportMap: ExportMap,
  cfg: TsConfig, boundary: RepoBoundary,
): ResolveOutput {
  const table = new SymbolTable();
  for (const [file, res] of files) for (const s of res.symbols) table.add(file, s);

  const out: ResolveOutput = { edges: [], external: [], unresolved: [] };

  for (const [file, res] of files) {
    const bindings = bindImports(file, res.imports, exportMap, cfg, boundary);

    // CONTAINS edges are structural and always LEXICAL.
    for (const s of res.symbols) {
      const dot = s.qualifiedName.lastIndexOf(".");
      if (dot < 0) continue;
      const parent = table.inFile(file, s.qualifiedName.slice(0, dot).split(".").pop()!);
      if (parent) {
        out.edges.push({
          srcKey: parent.stableKey, dstKey: s.stableKey, kind: "CONTAINS",
          tier: "LEXICAL", confidence: 1.0, siteLine: s.startLine,
        });
      }
    }

    for (const ref of res.references) {
      const binding = bindings.get(ref.receiver ?? ref.name) ?? bindings.get(ref.name) ?? null;

      let candidates = table.candidates(ref.name);
      if (binding && "file" in binding) {
        const narrowed = candidates.filter(c => c.stableKey.includes(`:${binding.file}#`));
        if (narrowed.length) candidates = narrowed;
      }

      const { tier, confidence } = assignTier(ref, candidates, binding);

      // EXTERNAL is a first-class outcome, not a flavour of unresolved (spec §4.4):
      // without it, console.log/React/Promise would dominate the unresolved count
      // and make the completeness signal meaningless.
      if (tier === "EXTERNAL") {
        out.external.push({
          srcKey: ref.fromSymbolKey, name: ref.name,
          packageOrLib: (binding as { external: string }).external, siteLine: ref.siteLine,
        });
        continue;
      }
      if (tier === "UNRESOLVED") {
        out.unresolved.push({
          srcKey: ref.fromSymbolKey, name: ref.name, kind: ref.kind,
          siteLine: ref.siteLine, candidateCount: 0, reason: "no_candidate",
        });
        continue;
      }

      // Ambiguous heuristics emit one edge per candidate, each carrying 1/n.
      for (const c of candidates) {
        out.edges.push({
          srcKey: ref.fromSymbolKey, dstKey: c.stableKey, kind: ref.kind,
          tier, confidence, siteLine: ref.siteLine,
        });
      }
    }
  }

  return out;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/resolve/`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/resolve tests/resolve
git commit -m "feat: add evidence-tiered reference resolution"
```

---

### Task 13: Index pipeline — full and incremental

**Files:**
- Create: `src/index/pipeline.ts`, `tests/index/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–12
- Produces:
  - `async function indexRepo(root: string, dbPath: string): Promise<IndexStats>`
  - `async function updateRepo(root: string, dbPath: string): Promise<IndexStats>`
  - `interface IndexStats { filesIndexed: number; filesSkipped: number; symbols: number; edges: number; external: number; unresolved: number; parseFailures: number; }`

Spec §13.2 (PRD) and §8.3. Edge lifecycle on re-extraction is the subtle part.

- [ ] **Step 1: Write the failing test**

```ts
// tests/index/pipeline.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo, updateRepo } from "../../src/index/pipeline.js";
import { openDb, migrate, Store } from "../../src/store/index.js";

let root: string, dbPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-idx-"));
  dbPath = join(root, "index.sqlite");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "util.ts"), "export function validate(t: string) { return !!t; }");
  writeFileSync(join(root, "src", "auth.ts"),
    `import { validate } from "./util";\nexport function refresh() { return validate("x"); }`);
});

describe("index pipeline", () => {
  it("indexes symbols and a cross-file call edge", async () => {
    const stats = await indexRepo(root, dbPath);
    expect(stats.filesIndexed).toBe(2);
    expect(stats.symbols).toBeGreaterThanOrEqual(2);
    expect(stats.edges).toBeGreaterThan(0);
  });

  it("skips unchanged files on update", async () => {
    await indexRepo(root, dbPath);
    const s = await updateRepo(root, dbPath);
    expect(s.filesIndexed).toBe(0);
    expect(s.filesSkipped).toBe(2);
  });

  it("re-indexes only a changed file", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(join(root, "src", "auth.ts"),
      `import { validate } from "./util";\nexport function refresh() { return validate("y"); }\nexport function extra() {}`);
    const s = await updateRepo(root, dbPath);
    expect(s.filesIndexed).toBe(1);
  });

  it("demotes inbound edges to unresolved when a target symbol is deleted", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(join(root, "src", "util.ts"), "export function somethingElse() { return 1; }");
    await updateRepo(root, dbPath);

    const db = openDb(dbPath); migrate(db);
    const unresolved = db.prepare("SELECT name, reason FROM unresolved_ref").all() as any[];
    expect(unresolved.some(u => u.name === "validate" && u.reason === "target_removed")).toBe(true);
    db.close();
  });

  it("re-attempts unresolved refs when a matching symbol appears", async () => {
    writeFileSync(join(root, "src", "auth.ts"),
      `export function refresh() { return brandNew(); }`);
    await indexRepo(root, dbPath);

    writeFileSync(join(root, "src", "util.ts"), "export function brandNew() { return 1; }");
    await updateRepo(root, dbPath);

    const db = openDb(dbPath); migrate(db);
    const edges = db.prepare("SELECT COUNT(*) AS n FROM edge WHERE kind = 'CALLS'").get() as any;
    expect(edges.n).toBeGreaterThan(0);
  });

  it("continues indexing when one file fails to parse", async () => {
    writeFileSync(join(root, "src", "broken.ts"), "export function ( {{{ ");
    const stats = await indexRepo(root, dbPath);
    expect(stats.parseFailures).toBeGreaterThanOrEqual(1);
    expect(stats.filesIndexed).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index/pipeline.test.ts`
Expected: FAIL — cannot resolve `pipeline.js`

- [ ] **Step 3: Implement**

```ts
// src/index/pipeline.ts
import { RepoBoundary } from "../repo/boundary.js";
import { discover, type FileRecord } from "../repo/discover.js";
import { openDb, migrate, Store } from "../store/index.js";
import { loadTsConfig } from "../tsconfig/load.js";
import { buildExportMap } from "../link/exportmap.js";
import { resolveAll } from "../resolve/resolver.js";
import { typescriptAdapter } from "../adapters/typescript/index.js";
import { getTsParser } from "../adapters/typescript/parser.js";
import type { ExtractResult } from "../adapters/types.js";

export interface IndexStats {
  filesIndexed: number; filesSkipped: number; symbols: number;
  edges: number; external: number; unresolved: number; parseFailures: number;
}

async function run(root: string, dbPath: string, incremental: boolean): Promise<IndexStats> {
  await getTsParser();                       // warm the WASM parser once
  const boundary = new RepoBoundary(root);
  const cfg = loadTsConfig(boundary);
  const db = openDb(dbPath);
  migrate(db);
  const store = new Store(db);

  const onDisk = discover(boundary);
  const known = new Map(store.allFiles().map(f => [f.path, f]));

  const changed: FileRecord[] = [];
  let skipped = 0;
  for (const f of onDisk) {
    const prev = known.get(f.path);
    if (incremental && prev && prev.contentHash === f.contentHash) { skipped++; continue; }
    changed.push(f);
  }

  // Deleted files leave the index; their symbols cascade, and inbound edges are
  // rebuilt below because resolution runs over the whole corpus.
  const onDiskPaths = new Set(onDisk.map(f => f.path));
  const deleted = [...known.keys()].filter(p => !onDiskPaths.has(p));

  const stats: IndexStats = {
    filesIndexed: changed.length, filesSkipped: skipped,
    symbols: 0, edges: 0, external: 0, unresolved: 0, parseFailures: 0,
  };

  // EXTRACT every file: resolution is global, so it needs the whole corpus even
  // when only one file changed. Extraction of unchanged files is cheap and pure.
  const extracted = new Map<string, ExtractResult>();
  for (const f of onDisk) {
    if (!typescriptAdapter.matches(f.path)) continue;
    try {
      const res = typescriptAdapter.extract(f.path, boundary.readFile(f.path));
      if (res.diagnostics.some(d => d.severity === "warning")) stats.parseFailures++;
      extracted.set(f.path, res);
    } catch {
      stats.parseFailures++;
    }
  }

  const exportMap = buildExportMap(extracted, cfg, boundary);
  const resolved = resolveAll(extracted, exportMap, cfg, boundary);

  store.transaction(() => {
    for (const p of deleted) store.deleteFile(p);
    // Replace every file's rows: symbol and edge rows cascade on file delete,
    // so a full rewrite is both simplest and atomic.
    for (const f of onDisk) {
      if (!extracted.has(f.path)) continue;
      store.deleteFile(f.path);
      store.upsertFile(f);
    }
    for (const [path, res] of extracted) {
      store.insertSymbols(res.symbols.map(s => ({
        stableKey: s.stableKey, filePath: path, qualifiedName: s.qualifiedName,
        shortName: s.shortName, kind: s.kind, signature: s.signature,
        startByte: s.startByte, endByte: s.endByte,
        startLine: s.startLine, endLine: s.endLine,
        bodyHash: s.bodyHash, exported: s.exported, isTest: s.isTest,
      })));
      stats.symbols += res.symbols.length;
    }
    store.insertEdges(resolved.edges);
    store.insertExternal(resolved.external);
    store.insertUnresolved(resolved.unresolved);
  });

  stats.edges = resolved.edges.length;
  stats.external = resolved.external.length;
  stats.unresolved = resolved.unresolved.length;
  db.close();
  return stats;
}

export const indexRepo  = (root: string, dbPath: string) => run(root, dbPath, false);
export const updateRepo = (root: string, dbPath: string) => run(root, dbPath, true);
```

Note on the `target_removed` test: because resolution runs over the whole corpus each pass, a reference whose target vanished naturally lands in `unresolved` with `reason: "no_candidate"`. Change `resolver.ts` to emit `reason: "target_removed"` when the name previously existed — pass the prior symbol-name set into `resolveAll` as an optional `Set<string>` and use it to pick the reason string.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/index/pipeline.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/index tests/index src/resolve/resolver.ts
git commit -m "feat: add full and incremental index pipeline with edge lifecycle"
```

---

### Task 14: Drift detection

**Files:**
- Create: `src/index/drift.ts`, `tests/index/drift.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 4), `discover` (Task 3)
- Produces:
  - `interface DriftReport { state: "fresh" | "refreshed" | "partial"; driftCount: number; driftedPaths: string[]; }`
  - `function checkDrift(boundary, store, limit?): DriftReport`

Spec §8.2. `stat` only — hash exclusively on `mtime`/`size` mismatch.

- [ ] **Step 1: Write the failing test**

```ts
// tests/index/drift.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";
import { checkDrift } from "../../src/index/drift.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { openDb, migrate, Store } from "../../src/store/index.js";

let root: string, dbPath: string;
const store = () => { const d = openDb(dbPath); migrate(d); return new Store(d); };

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "cg-drift-"));
  dbPath = join(root, "index.sqlite");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "a.ts"), "export function a() {}");
  await indexRepo(root, dbPath);
});

describe("checkDrift", () => {
  it("reports fresh when nothing changed", () => {
    expect(checkDrift(new RepoBoundary(root), store()).state).toBe("fresh");
  });

  it("detects a modified file", () => {
    writeFileSync(join(root, "src", "a.ts"), "export function a() { return 1; }");
    const r = checkDrift(new RepoBoundary(root), store());
    expect(r.driftCount).toBe(1);
    expect(r.driftedPaths).toContain("src/a.ts");
  });

  it("detects a new untracked file", () => {
    writeFileSync(join(root, "src", "b.ts"), "export function b() {}");
    expect(checkDrift(new RepoBoundary(root), store()).driftedPaths).toContain("src/b.ts");
  });

  it("ignores an mtime touch when content is identical", () => {
    const now = new Date();
    utimesSync(join(root, "src", "a.ts"), now, now);
    expect(checkDrift(new RepoBoundary(root), store()).state).toBe("fresh");
  });

  it("reports partial when drift exceeds the auto-refresh limit", () => {
    for (let i = 0; i < 5; i++) writeFileSync(join(root, "src", `n${i}.ts`), `export const n${i} = ${i};`);
    expect(checkDrift(new RepoBoundary(root), store(), 2).state).toBe("partial");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index/drift.test.ts`
Expected: FAIL — cannot resolve `drift.js`

- [ ] **Step 3: Implement**

```ts
// src/index/drift.ts
import { statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { RepoBoundary } from "../repo/boundary.js";
import type { Store } from "../store/index.js";
import { discover } from "../repo/discover.js";

export const AUTO_REFRESH_LIMIT = 25;

export interface DriftReport {
  state: "fresh" | "refreshed" | "partial";
  driftCount: number;
  driftedPaths: string[];
}

/**
 * stat-only first pass; hashing happens exclusively for mtime/size mismatches.
 * Cheap enough to run on every tool call (spec §8.2).
 */
export function checkDrift(
  boundary: RepoBoundary, store: Store, limit = AUTO_REFRESH_LIMIT,
): DriftReport {
  const known = new Map(store.allFiles().map(f => [f.path, f]));
  const drifted: string[] = [];

  for (const [path, rec] of known) {
    let st;
    try { st = statSync(join(boundary.root, path)); }
    catch { drifted.push(path); continue; }          // deleted

    if (st.size === rec.size && st.mtimeMs === rec.mtimeMs) continue;

    // mtime or size moved — confirm with a hash before calling it drift.
    const hash = createHash("sha256").update(readFileSync(join(boundary.root, path))).digest("hex");
    if (hash !== rec.contentHash) drifted.push(path);
  }

  // New files count as drift (spec §8.2).
  for (const f of discover(boundary)) {
    if (!known.has(f.path)) drifted.push(f.path);
  }

  const driftCount = drifted.length;
  const state = driftCount === 0 ? "fresh" : driftCount <= limit ? "refreshed" : "partial";
  return { state, driftCount, driftedPaths: drifted };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/index/drift.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/index/drift.ts tests/index/drift.test.ts
git commit -m "feat: add stat-based drift detection with hash confirmation"
```

---

### Task 15: CLI and the oracle accuracy report

**Files:**
- Create: `src/cli/main.ts`, `bench/report.ts`, `tests/cli/cli.test.ts`
- Modify: `package.json` (add `bench:oracle` script)

**Interfaces:**
- Consumes: `indexRepo`/`updateRepo` (Task 13), `checkDrift` (Task 14), `compare` (Task 11)
- Produces: `sonde index|update|status|doctor|clean` and `npm run bench:oracle`

This closes Plan 1: an indexed graph plus a published accuracy number.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/cli.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
const cli = (...args: string[]) =>
  execFileSync("npx", ["tsx", "src/cli/main.ts", ...args], { encoding: "utf8" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-cli-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "a.ts"), "export function a() {}");
});

describe("cli", () => {
  it("indexes and prints JSON stats", () => {
    const out = JSON.parse(cli("index", root, "--json"));
    expect(out.filesIndexed).toBe(1);
  });

  it("reports fresh status after indexing", () => {
    cli("index", root, "--json");
    expect(JSON.parse(cli("status", root, "--json")).freshness.state).toBe("fresh");
  });

  it("reports drift after a source change", () => {
    cli("index", root, "--json");
    writeFileSync(join(root, "src", "a.ts"), "export function a() { return 1; }");
    expect(JSON.parse(cli("status", root, "--json")).freshness.driftCount).toBe(1);
  });

  it("doctor reports parser and database health", () => {
    const out = JSON.parse(cli("doctor", root, "--json"));
    expect(out.parser).toBe("ok");
    expect(out.tscVersion).toMatch(/^\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/cli.test.ts`
Expected: FAIL — cannot resolve `src/cli/main.ts`

- [ ] **Step 3: Implement the CLI**

```ts
// src/cli/main.ts
import { Command } from "commander";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import ts from "typescript";
import { indexRepo, updateRepo } from "../index/pipeline.js";
import { checkDrift } from "../index/drift.js";
import { RepoBoundary } from "../repo/boundary.js";
import { openDb, migrate, Store } from "../store/index.js";
import { getTsParser } from "../adapters/typescript/parser.js";
import { SCHEMA_VERSION } from "../version.js";

/** Index lives in the user cache dir, keyed by canonical root (spec §3). */
function indexPathFor(root: string): string {
  const boundary = new RepoBoundary(root);
  const hash = createHash("sha256").update(boundary.root).digest("hex").slice(0, 16);
  const dir = join(homedir(), ".cache", "sonde", hash);
  mkdirSync(dir, { recursive: true });
  return join(dir, "index.sqlite");
}

const emit = (json: boolean, obj: unknown, human: string): void => {
  console.log(json ? JSON.stringify(obj, null, 2) : human);
};

const program = new Command();
program.name("sonde").version("0.1.0");

program.command("index").argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (path: string, opts: { json?: boolean }) => {
    const stats = await indexRepo(path, indexPathFor(path));
    emit(!!opts.json, stats,
      `indexed ${stats.filesIndexed} files, ${stats.symbols} symbols, ${stats.edges} edges ` +
      `(${stats.external} external, ${stats.unresolved} unresolved, ${stats.parseFailures} parse failures)`);
  });

program.command("update").argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (path: string, opts: { json?: boolean }) => {
    const stats = await updateRepo(path, indexPathFor(path));
    emit(!!opts.json, stats, `updated ${stats.filesIndexed} files (${stats.filesSkipped} unchanged)`);
  });

program.command("status").argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action((path: string, opts: { json?: boolean }) => {
    const dbPath = indexPathFor(path);
    if (!existsSync(dbPath)) {
      emit(!!opts.json, { freshness: { state: "unknown" } }, "no index; run `sonde index`");
      return;
    }
    const db = openDb(dbPath); migrate(db);
    const store = new Store(db);
    const drift = checkDrift(new RepoBoundary(path), store);
    const counts = db.prepare(`
      SELECT (SELECT COUNT(*) FROM symbol) AS symbols,
             (SELECT COUNT(*) FROM edge) AS edges,
             (SELECT COUNT(*) FROM unresolved_ref) AS unresolved
    `).get();
    const tiers = db.prepare("SELECT tier, COUNT(*) AS n FROM edge GROUP BY tier").all();
    emit(!!opts.json, { freshness: drift, counts, tiers, schemaVersion: SCHEMA_VERSION },
      `${drift.state} — drift ${drift.driftCount}; ${(counts as any).symbols} symbols, ${(counts as any).edges} edges`);
  });

program.command("doctor").argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (path: string, opts: { json?: boolean }) => {
    let parser = "ok";
    try { await getTsParser(); } catch (e) { parser = `failed: ${(e as Error).message}`; }
    const report = {
      parser,
      tscVersion: ts.version,
      tscSource: "bundled (repository typescript is never loaded — SEC-008)",
      schemaVersion: SCHEMA_VERSION,
      indexPath: indexPathFor(path),
      node: process.version,
    };
    emit(!!opts.json, report, Object.entries(report).map(([k, v]) => `${k}: ${v}`).join("\n"));
  });

program.command("clean").argument("[path]", "repository root", ".")
  .action((path: string) => {
    const p = indexPathFor(path);
    rmSync(p, { force: true });
    console.log(`removed ${p}`);
  });

program.parseAsync(process.argv);
```

- [ ] **Step 4: Implement the oracle report**

```ts
// bench/report.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { buildOracle, type OracleEdge } from "./oracle/extract.js";
import { compare } from "./oracle/compare.js";
import { indexRepo } from "../src/index/pipeline.js";
import { openDb, migrate } from "../src/store/index.js";

const FIXTURES = ["tests/fixtures/repos/small"];

/** Reads Sonde's own edges back out in OracleEdge shape for comparison. */
function actualEdges(dbPath: string): OracleEdge[] {
  const db = openDb(dbPath); migrate(db);
  const rows = db.prepare(`
    SELECT fs.path AS srcFile, s.qualified_name AS srcSymbol,
           fd.path AS dstFile, d.qualified_name AS dstSymbol, e.kind
    FROM edge e
      JOIN symbol s ON s.id = e.src_symbol_id JOIN file fs ON fs.id = s.file_id
      JOIN symbol d ON d.id = e.dst_symbol_id JOIN file fd ON fd.id = d.file_id
    WHERE e.kind IN ('CALLS','REFERENCES','INHERITS','IMPLEMENTS')
  `).all() as OracleEdge[];
  db.close();
  return rows;
}

const lines: string[] = [
  "# Sonde edge accuracy vs the TypeScript compiler",
  "",
  `Generated: ${new Date().toISOString()}`,
  `TypeScript: ${ts.version} (bundled; the repository's own typescript is never loaded)`,
  "",
  "Oracle is filtered to in-repo targets. `node_modules` and `.d.ts` declarations are",
  "excluded from both sides. Type-only references, JSX intrinsics, `export =`, decorators",
  "and declaration merging are known, expected divergences (spec §10).",
  "",
];

for (const fixture of FIXTURES) {
  const root = join(process.cwd(), fixture);
  const dbPath = join(root, ".bench-index.sqlite");
  await indexRepo(root, dbPath);
  const report = compare(actualEdges(dbPath), buildOracle(root));

  lines.push(`## ${fixture}`, "", "| Edge kind | Precision | Recall | TP | FP | FN |", "|---|---:|---:|---:|---:|---:|");
  for (const [kind, s] of Object.entries(report.byKind)) {
    lines.push(`| ${kind} | ${s.precision.toFixed(3)} | ${s.recall.toFixed(3)} | ${s.tp} | ${s.fp} | ${s.fn} |`);
  }
  lines.push("", `**Overall:** precision ${report.overall.precision.toFixed(3)}, recall ${report.overall.recall.toFixed(3)}`, "");
}

writeFileSync(join(process.cwd(), "ORACLE.md"), lines.join("\n"));
console.log(lines.join("\n"));
```

Add to `package.json`: `"bench:oracle": "tsx bench/report.ts"` and `tsx` to devDependencies.

- [ ] **Step 5: Run tests and generate the first report**

Run: `npx vitest run && npm run bench:oracle`
Expected: all tests PASS; `ORACLE.md` written with real precision/recall numbers.

**The numbers will be poor on the first run. That is the point** — this is the baseline the resolver is tuned against, and per spec §12 it gets published including the unflattering values.

- [ ] **Step 6: Run the whole suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli bench/report.ts tests/cli ORACLE.md package.json
git commit -m "feat: add CLI and publish oracle accuracy report"
```

---

### Task 16: TESTS edge derivation with fan-out cap

**Files:**
- Create: `src/resolve/tests.ts`, `tests/resolve/tests-edges.test.ts`
- Modify: `src/resolve/resolver.ts` (call `deriveTestEdges` and append to `out.edges`)

**Interfaces:**
- Consumes: `SymbolRecord` (Task 7), `ReferenceRecord` (Task 8), `ExportMap` (Task 10), `EdgeRow` (Task 4)
- Produces: `function deriveTestEdges(files, exportMap, resolvedTargets): { edges: EdgeRow[]; capped: string[] }`

Spec §6.4. Three rules, each with a test:

1. `TESTS` edges are **always `HEURISTIC`** — a test referencing a symbol is evidence of relatedness, never proof of coverage.
2. References arriving **through a barrel re-export are excluded**. A test importing `./index` would otherwise link to the entire module.
3. Fan-out is **capped at 25** targets per test symbol, ranked by reference count then proximity, and the cap is reported when it binds.

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolve/tests-edges.test.ts
import { describe, it, expect } from "vitest";
import { deriveTestEdges } from "../../src/resolve/tests.js";

const sym = (key: string, isTest = false) => ({
  stableKey: key, qualifiedName: key.split("#")[1]!, shortName: key.split("#")[1]!,
  kind: isTest ? "test" as const : "function" as const, signature: null,
  startByte: 0, endByte: 1, startLine: 1, endLine: 2,
  bodyHash: null, exported: true, isTest,
});

const ref = (from: string, name: string, viaBarrel = false) => ({
  fromSymbolKey: from, name, receiver: null,
  kind: "CALLS" as const, siteLine: 1, viaBarrel,
});

describe("deriveTestEdges", () => {
  it("emits a HEURISTIC TESTS edge from a test to a directly referenced symbol", () => {
    const { edges } = deriveTestEdges(
      [sym("ts:a.test.ts#spec", true), sym("ts:a.ts#target")],
      [ref("ts:a.test.ts#spec", "target")],
      new Map([["target", ["ts:a.ts#target"]]]),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      srcKey: "ts:a.test.ts#spec", dstKey: "ts:a.ts#target",
      kind: "TESTS", tier: "HEURISTIC",
    });
  });

  it("never emits a TESTS edge from a non-test symbol", () => {
    const { edges } = deriveTestEdges(
      [sym("ts:a.ts#notATest"), sym("ts:a.ts#target")],
      [ref("ts:a.ts#notATest", "target")],
      new Map([["target", ["ts:a.ts#target"]]]),
    );
    expect(edges).toHaveLength(0);
  });

  it("excludes references arriving through a barrel re-export", () => {
    const { edges } = deriveTestEdges(
      [sym("ts:a.test.ts#spec", true), sym("ts:a.ts#target")],
      [ref("ts:a.test.ts#spec", "target", true)],
      new Map([["target", ["ts:a.ts#target"]]]),
    );
    expect(edges).toHaveLength(0);
  });

  it("caps fan-out at 25 and reports the capped test", () => {
    const targets = Array.from({ length: 40 }, (_, i) => sym(`ts:a.ts#t${i}`));
    const refs = targets.map(t => ref("ts:a.test.ts#spec", t.shortName));
    const map = new Map(targets.map(t => [t.shortName, [t.stableKey]]));
    const { edges, capped } = deriveTestEdges([sym("ts:a.test.ts#spec", true), ...targets], refs, map);
    expect(edges).toHaveLength(25);
    expect(capped).toContain("ts:a.test.ts#spec");
  });

  it("ranks by reference count so the most-referenced targets survive the cap", () => {
    const targets = Array.from({ length: 30 }, (_, i) => sym(`ts:a.ts#t${i}`));
    const refs = [
      ...targets.map(t => ref("ts:a.test.ts#spec", t.shortName)),
      ...Array.from({ length: 5 }, () => ref("ts:a.test.ts#spec", "t29")), // t29 referenced 6x
    ];
    const map = new Map(targets.map(t => [t.shortName, [t.stableKey]]));
    const { edges } = deriveTestEdges([sym("ts:a.test.ts#spec", true), ...targets], refs, map);
    expect(edges.map(e => e.dstKey)).toContain("ts:a.ts#t29");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve/tests-edges.test.ts`
Expected: FAIL — cannot resolve `tests.js`

- [ ] **Step 3: Add `viaBarrel` to `ReferenceRecord`**

In `src/adapters/types.ts`, extend `ReferenceRecord`:

```ts
export interface ReferenceRecord {
  fromSymbolKey: string;
  name: string;
  receiver: string | null;
  kind: "CALLS" | "REFERENCES" | "IMPLEMENTS" | "INHERITS";
  siteLine: number;
  /** True when the binding for this name resolved through a re-export (spec §6.4). */
  viaBarrel?: boolean;
}
```

In `src/resolve/resolver.ts`, set it while binding: a binding is `viaBarrel` when the owning file returned by `exportMap` differs from the file the specifier resolved to.

- [ ] **Step 4: Implement**

```ts
// src/resolve/tests.ts
import type { SymbolRecord, ReferenceRecord } from "../adapters/types.js";
import type { EdgeRow } from "../store/repos.js";

export const TEST_FANOUT_CAP = 25;

/**
 * TESTS edges are ALWAYS HEURISTIC: a test referencing a symbol is evidence of
 * relatedness, never proof of coverage (spec §6.4). Every surface exposing them
 * must repeat that caveat.
 */
export function deriveTestEdges(
  symbols: SymbolRecord[],
  references: ReferenceRecord[],
  resolvedTargets: Map<string, string[]>,   // reference name → candidate stable keys
): { edges: EdgeRow[]; capped: string[] } {
  const testKeys = new Set(symbols.filter(s => s.isTest).map(s => s.stableKey));
  const capped: string[] = [];

  // test symbol → (target key → reference count)
  const counts = new Map<string, Map<string, number>>();

  for (const ref of references) {
    if (!testKeys.has(ref.fromSymbolKey)) continue;   // rule: only from tests
    if (ref.viaBarrel) continue;                       // rule: direct references only

    for (const target of resolvedTargets.get(ref.name) ?? []) {
      if (testKeys.has(target)) continue;              // tests do not test tests
      const per = counts.get(ref.fromSymbolKey) ?? new Map<string, number>();
      per.set(target, (per.get(target) ?? 0) + 1);
      counts.set(ref.fromSymbolKey, per);
    }
  }

  const edges: EdgeRow[] = [];
  for (const [testKey, per] of counts) {
    const ranked = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > TEST_FANOUT_CAP) capped.push(testKey);
    for (const [target] of ranked.slice(0, TEST_FANOUT_CAP)) {
      edges.push({
        srcKey: testKey, dstKey: target, kind: "TESTS",
        tier: "HEURISTIC", confidence: 1 / ranked.length, siteLine: null,
      });
    }
  }

  return { edges, capped };
}
```

- [ ] **Step 5: Wire into the resolver**

At the end of `resolveAll` in `src/resolve/resolver.ts`, before returning:

```ts
const allSymbols = [...files.values()].flatMap(r => r.symbols);
const allRefs = [...files.values()].flatMap(r => r.references);
const targetMap = new Map<string, string[]>();
for (const s of allSymbols) {
  const list = targetMap.get(s.shortName) ?? [];
  list.push(s.stableKey);
  targetMap.set(s.shortName, list);
}
const { edges: testEdges, capped } = deriveTestEdges(allSymbols, allRefs, targetMap);
out.edges.push(...testEdges);
if (capped.length) {
  out.unresolved.push(...capped.map(k => ({
    srcKey: k, name: "*", kind: "TESTS", siteLine: null,
    candidateCount: 0, reason: "test_fanout_capped",
  })));
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/resolve/`
Expected: PASS, all resolve tests including the 5 new ones

- [ ] **Step 7: Commit**

```bash
git add src/resolve/tests.ts src/resolve/resolver.ts src/adapters/types.ts tests/resolve/tests-edges.test.ts
git commit -m "feat: derive TESTS edges with barrel exclusion and fan-out cap"
```

---

## Plan 1 completion criteria

- [ ] `npx sonde index <repo>` produces a populated SQLite graph, including `TESTS` edges
- [ ] `sonde status` reports drift and tier distribution
- [ ] `sonde doctor` reports parser, tsc version, and index path
- [ ] `ORACLE.md` contains real precision/recall per edge kind
- [ ] Swift spike findings recorded; adapter contract amended if Part B failed
- [ ] `npm run typecheck && npm test` clean in CI

---

## Subsequent plans

**Plan 2 — Query and MCP surface.** FTS5 indexing and `find_symbols`; the traversal engine and `query_graph` with all ten patterns and the tiered output shape; `get_impact_radius` including `INHERITS` traversal and `from_git_diff`; the §7.4 ranking function; §7.5 token budgeting with `js-tiktoken`; the §7.6 envelope; the §8.2 read-path drift integration with inline refresh and tier-downgrade warnings; MCP stdio server; verification in Claude Code plus one other client.

**Plan 3 — Benchmark and release.** The 12 adversarially-selected tasks with the published selection criteria; a strong agentic-search baseline harness; recall@k, token, tool-call, latency, and tier-utility metrics; delta-gated oracle CI; medium and large fixture repos; README with the accuracy table; Apache-2.0 licensing, contribution guide, and npm publish.

Each is written once its predecessor lands, so measured results from Plan 1 inform Plan 2's ranking and budget decisions.
