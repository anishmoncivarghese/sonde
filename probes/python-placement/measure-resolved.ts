// Measures the pyright tier against the thresholds fixed in PROTOCOL.md.
// Python registration remains conditional on this result (design §8.3).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";
import { runPyrightPass } from "../../src/resolve/pyrightPass.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
}

const root = process.argv[2];
if (!root) throw new Error("usage: measure-resolved.ts <repo-path>");

const dbDir = mkdtempSync(join(tmpdir(), "sonde-gate-"));
const dbPath = join(dbDir, "index.sqlite");

// Task 6 temporarily enables Python in registry/discovery while this runs.
// Resolution is invoked directly below so the probe can disclose the pass's
// null-site, unmatched-site, and name-wide deletion accounting.
const indexStats = await indexRepo(root, dbPath, { resolve: false });
const db = openDb(dbPath);
migrate(db);
const store = new Store(db);

try {
  const externalBefore = store.countExternal();
  const typeshedBefore = (
    db.prepare(
      "SELECT COUNT(*) AS n FROM external_ref WHERE package_or_lib = 'typeshed'",
    ).get() as { n: number }
  ).n;

  const pass = await runPyrightPass(root, store);
  if (pass === null) {
    throw new Error("pyright pass found no Python query sites");
  }
  if ("unavailable" in pass) {
    throw new Error(`pyright pass unavailable: ${pass.reason}`);
  }

  // C1: these are distinct reference-site proxies, not raw edge counts.
  const compiler = store.countReferenceSites("COMPILER");
  const lexical = store.countReferenceSites("LEXICAL");
  const heuristic = store.countReferenceSites("HEURISTIC");
  const unresolved = store.countUnresolved();
  const external = store.countExternal();
  const typeshed = (
    db.prepare(
      "SELECT COUNT(*) AS n FROM external_ref WHERE package_or_lib = 'typeshed'",
    ).get() as { n: number }
  ).n;
  const placed = compiler + lexical + heuristic;
  const inRepoReferences = placed + unresolved;
  const unresolvedShare = percent(unresolved, inRepoReferences);
  const placedShare = percent(placed, inRepoReferences);
  const verdict =
    unresolvedShare <= 30 && placedShare >= 70
      ? "PASS"
      : unresolvedShare <= 50
        ? "MARGINAL"
        : "FAIL";

  console.log(JSON.stringify({
    repo: relative(process.cwd(), root) || root,
    files: indexStats.filesIndexed,
    parseErrorFiles: indexStats.parseFailures,
    references: placed + external + unresolved,
    COMPILER: compiler,
    LEXICAL: lexical,
    HEURISTIC: heuristic,
    EXTERNAL: external,
    UNRESOLVED: unresolved,
    inRepoReferences,
    unresolvedShare,
    placedShare,
    verdict,
    pyright: {
      version: pass.pyrightVersion,
      queries: pass.queries,
      answered: pass.answered,
      noDefinition: pass.queries - pass.answered,
      upgraded: pass.upgraded,
      externalized: pass.externalized,
      externalAdded: external - externalBefore,
      typeshedAdded: typeshed - typeshedBefore,
      unresolvedCleared: pass.unresolvedCleared,
      extraUnresolvedCleared: pass.extraUnresolvedCleared,
      skippedNullSites: pass.skippedNullSites,
      unmatchedSites: pass.unmatchedSites,
      warnings: pass.warnings,
    },
  }, null, 2));
} finally {
  db.close();
}
