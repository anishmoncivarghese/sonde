import type { Db } from "../store/db.js";

export interface RankInput {
  distance: number;
  fanIn: number;
  exported: boolean;
  pathFocusMatch: boolean;
}

const USAGE_KINDS = ["CALLS", "REFERENCES", "IMPLEMENTS", "INHERITS"];

/** Per-repository p95 of inbound usage-edge fan-in, computed live. */
export function fanInP95(db: Db): number {
  const rows = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM edge
       WHERE kind IN (${USAGE_KINDS.map(() => "?").join(",")})
       GROUP BY dst_symbol_id
       ORDER BY count ASC`,
    )
    .all(...USAGE_KINDS) as Array<{ count: number }>;
  if (rows.length === 0) return 0;

  const index = Math.min(
    rows.length - 1,
    Math.ceil(0.95 * rows.length) - 1,
  );
  return rows[Math.max(0, index)]!.count;
}

/** Additive ranking formula from spec §7.4, applied only within a tier. */
export function score(input: RankInput, p95: number): number {
  const fanInTerm = p95 > 0
    ? Math.min(1, Math.log(1 + input.fanIn) / Math.log(1 + p95))
    : 0;

  return (
    0.4 * (1 / (1 + input.distance)) +
    0.25 * fanInTerm +
    0.2 * (input.exported ? 1 : 0) +
    0.15 * (input.pathFocusMatch ? 1 : 0)
  );
}
