import type { OracleEdge } from "./extract.js";

export interface KindScore {
  precision: number;
  recall: number;
  tp: number;
  fp: number;
  fn: number;
}

export interface Report {
  byKind: Record<string, KindScore>;
  overall: KindScore;
}

const key = (e: OracleEdge) =>
  `${e.srcFile}|${e.srcSymbol}|${e.dstFile}|${e.dstSymbol}|${e.kind}`;

function score(actual: OracleEdge[], expected: OracleEdge[]): KindScore {
  const a = new Set(actual.map(key));
  const e = new Set(expected.map(key));
  let tp = 0;
  for (const k of a) if (e.has(k)) tp++;
  const fp = a.size - tp;
  const fn = e.size - tp;
  return {
    tp,
    fp,
    fn,
    precision: a.size === 0 ? 1 : tp / a.size,
    recall: e.size === 0 ? 1 : tp / e.size,
  };
}

/**
 * Re-label an edge as REFERENCES so a specific stored kind can be scored
 * against the oracle's broader reference set (spec §6.1).
 */
const asReference = (edge: OracleEdge): OracleEdge => ({
  ...edge,
  kind: "REFERENCES",
});

export function compare(actual: OracleEdge[], expected: OracleEdge[]): Report {
  const kinds = [...new Set([...actual, ...expected].map((x) => x.kind))];
  const byKind: Record<string, KindScore> = {};
  for (const kind of kinds) {
    // Spec §6.1: CALLS is a subset of REFERENCES. CodeGraph stores each edge
    // once and unions the kinds at query time, while tsc's findReferences
    // reports call sites and heritage clauses as references too. Scoring the
    // stored REFERENCES rows alone therefore reported 0.000 recall for queries
    // that would in fact return the edge. The subset runs one way only: a
    // plain reference is never credited as a call.
    const actualForKind =
      kind === "REFERENCES"
        ? actual.map(asReference)
        : actual.filter((x) => x.kind === kind);
    byKind[kind] = score(
      actualForKind,
      expected.filter((x) => x.kind === kind),
    );
  }
  // Aggregate the per-kind results rather than re-scoring with a stricter rule,
  // so the summary cannot contradict the rows it summarises.
  const totals = Object.values(byKind).reduce(
    (sum, kindScore) => ({
      tp: sum.tp + kindScore.tp,
      fp: sum.fp + kindScore.fp,
      fn: sum.fn + kindScore.fn,
    }),
    { tp: 0, fp: 0, fn: 0 },
  );
  const predicted = totals.tp + totals.fp;
  const relevant = totals.tp + totals.fn;

  return {
    byKind,
    overall: {
      ...totals,
      precision: predicted === 0 ? 1 : totals.tp / predicted,
      recall: relevant === 0 ? 1 : totals.tp / relevant,
    },
  };
}
