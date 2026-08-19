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
const TIERS = ["COMPILER", "LEXICAL", "HEURISTIC"] as const;

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
  "# CodeGraph edge accuracy vs the TypeScript compiler",
  "",
  `Generated: ${new Date().toISOString()}`,
  `TypeScript: ${ts.version} (bundled; repository TypeScript is never loaded)`,
  "",
  "The oracle is filtered to in-repo targets; `node_modules` and `.d.ts`",
  "declarations are excluded. Type-only references, JSX intrinsics, `export =`,",
  "decorators, and declaration merging are known expected divergences (spec §10).",
  "Tier rows compare that tier alone with the complete oracle, making each tier's",
  "independent contribution visible; `ALL` is the combined result.",
  "",
];

for (const fixture of FIXTURES) {
  const root = join(process.cwd(), fixture);
  const boundary = new RepoBoundary(root);
  const tempDirectory = mkdtempSync(join(tmpdir(), "codegraph-oracle-"));
  const dbPath = join(tempDirectory, "index.sqlite");

  try {
    await indexRepo(root, dbPath);
    const actual = actualEdges(dbPath);
    const expected = buildOracle(root);
    const combined = compare(actual, expected);

    lines.push(
      `## ${fixture}`,
      "",
      `Fixture config SHA-256: \`${configHash(boundary)}\``,
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
