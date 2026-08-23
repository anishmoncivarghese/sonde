import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { indexRepo } from "../src/index/pipeline.js";
import { RepoBoundary } from "../src/repo/boundary.js";
import { migrate, openDb } from "../src/store/index.js";
import { compare, type KindScore } from "./oracle/compare.js";
import { buildOracle, type OracleEdge } from "./oracle/extract.js";

const FIXTURES = ["tests/fixtures/repos/small"];
const TIERS = ["LEXICAL", "HEURISTIC"] as const;

interface ActualEdge extends OracleEdge {
  tier: (typeof TIERS)[number];
}

function actualEdges(dbPath: string): ActualEdge[] {
  const db = openDb(dbPath);
  try {
    migrate(db);
    return db
      .prepare(
        `SELECT fs.path AS srcFile, s.qualified_name AS srcSymbol,
                fd.path AS dstFile, d.qualified_name AS dstSymbol,
                e.kind, e.tier
         FROM edge e
           JOIN symbol s ON s.id = e.src_symbol_id
           JOIN file fs ON fs.id = s.file_id
           JOIN symbol d ON d.id = e.dst_symbol_id
           JOIN file fd ON fd.id = d.file_id
         WHERE e.kind IN ('CALLS', 'REFERENCES', 'INHERITS', 'IMPLEMENTS')`,
      )
      .all() as ActualEdge[];
  } finally {
    db.close();
  }
}

function configHash(boundary: RepoBoundary): string {
  return createHash("sha256")
    .update(boundary.readFile("tsconfig.json"))
    .digest("hex");
}

function scoreRow(kind: string, tier: string, score: KindScore): string {
  return `| ${kind} | ${tier} | ${score.precision.toFixed(3)} | ` +
    `${score.recall.toFixed(3)} | ${score.tp} | ${score.fp} | ${score.fn} |`;
}

const lines: string[] = [
  "# Sonde edge accuracy vs the TypeScript compiler",
  "",
  `Generated: ${new Date().toISOString()}`,
  `TypeScript: ${ts.version} (bundled; repository TypeScript is never loaded)`,
  "",
  "**What these numbers cover.** The oracle measures the tree-sitter resolution",
  "path — the zero-setup default, and the only tier whose accuracy is in question.",
  "COMPILER-tier edges come from the TypeScript compiler itself, so scoring them",
  "against the same compiler would measure nothing; they are exact by construction",
  "and excluded from these figures. Run `sonde index --resolve` to produce them.",
  "",
  "The oracle is filtered to in-repo targets; `node_modules` and `.d.ts`",
  "declarations are excluded. Type-only references, JSX intrinsics, `export =`,",
  "decorators, and declaration merging are known expected divergences (spec §10).",
  "Tier rows compare that tier alone with the complete oracle, making each tier's",
  "independent contribution visible; `ALL` is the combined result.",
  "",
  "## Why precision below 1.000 is expected here",
  "",
  "These divergences are structural, so reading a precision figure as",
  "\"how often Sonde is wrong\" overstates the error rate:",
  "",
  "1. **Ambiguous member calls emit every candidate.** For `x.foo()` with two",
  "   visible `foo` declarations, Sonde emits both as confidence-weighted",
  "   `HEURISTIC` edges. At most one matches the compiler, so the other counts",
  "   as a false positive by construction. The alternative is guessing a single",
  "   target, which invariant 1 forbids — a wrong resolved-looking edge is worse",
  "   than two honestly heuristic ones. Precision is therefore capped below",
  "   1.000 wherever the fixture contains an ambiguous call.",
  "2. **Constructor calls are ours alone.** Sonde emits `CALLS` for",
  "   `new Foo()`; the oracle does not model them, so each one is a false",
  "   positive against ground truth that omits it.",
  "3. **Member-level IMPLEMENTS is ours alone.** Sonde derives an",
  "   IMPLEMENTS edge from `RegExpRouter.add` to `Router.add` once the class",
  "   declares it implements the interface. tsc reports heritage clauses at the",
  "   type level only, so every member-level edge counts as a false positive",
  "   against ground truth that does not model them. The capability is the",
  "   reason impact on an interface method works at all, so the precision cost",
  "   is disclosed rather than removed.",
  "",
  "Counts are absolute, not percentages of a large corpus. Fixture edge totals",
  "appear below so a single edge's effect on each figure is visible.",
  "",
];

for (const fixture of FIXTURES) {
  const root = join(process.cwd(), fixture);
  const boundary = new RepoBoundary(root);
  const tempDirectory = mkdtempSync(join(tmpdir(), "sonde-oracle-"));
  const dbPath = join(tempDirectory, "index.sqlite");

  try {
    await indexRepo(root, dbPath);
    const actual = actualEdges(dbPath);
    const expected = buildOracle(root);
    const combined = compare(actual, expected);

    // Stated as data rather than as a "small fixture" caveat in prose: with
    // totals this size each figure moves in large steps, and a reader can only
    // judge that from the counts.
    const step = expected.length === 0
      ? "n/a"
      : `${(100 / expected.length).toFixed(1)}%`;

    lines.push(
      `## ${fixture}`,
      "",
      `Fixture config SHA-256: \`${configHash(boundary)}\``,
      "",
      `Oracle edges: ${expected.length} · Sonde edges: ${actual.length} · ` +
        `one oracle edge moves recall by ${step}`,
      "",
      "| Edge kind | Tier | Precision | Recall | TP | FP | FN |",
      "|---|---|---:|---:|---:|---:|---:|",
    );

    for (const [kind, score] of Object.entries(combined.byKind).sort()) {
      lines.push(scoreRow(kind, "ALL", score));
      for (const tier of TIERS) {
        const tierScore = compare(
          actual.filter((edge) => edge.tier === tier),
          expected,
        ).byKind[kind];
        if (tierScore) lines.push(scoreRow(kind, tier, tierScore));
      }
    }

    lines.push(
      "",
      `**Overall:** precision ${combined.overall.precision.toFixed(3)}, ` +
        `recall ${combined.overall.recall.toFixed(3)}`,
      "",
    );
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const output = lines.join("\n");
writeFileSync(join(process.cwd(), "ORACLE.md"), output);
console.log(output);
