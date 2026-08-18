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

export function compare(actual: OracleEdge[], expected: OracleEdge[]): Report {
  const kinds = [...new Set([...actual, ...expected].map((x) => x.kind))];
  const byKind: Record<string, KindScore> = {};
  for (const kind of kinds) {
    byKind[kind] = score(
      actual.filter((x) => x.kind === kind),
      expected.filter((x) => x.kind === kind),
    );
  }
  return { byKind, overall: score(actual, expected) };
}
