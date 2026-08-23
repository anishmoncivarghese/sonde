/**
 * Member-level IMPLEMENTS edges.
 *
 * Given `RegExpRouter implements Router`, the fact that `RegExpRouter.add`
 * satisfies `Router.add` is three structural hops away: up from the interface
 * member to its declaring type, across the type-level relationship, and back
 * down to the same-named member. Nothing walked that path, so
 * `impact(Router.add)` returned 49 heuristic symbols with 451 omitted and only
 * one of five real routers — surfaced by a name collision rather than by
 * structure. That is the single query a code graph should answer better than
 * text search.
 *
 * These edges are LEXICAL, not HEURISTIC. The class declares the relationship
 * and the compiler requires the member to exist; matching them is reading a
 * declaration, not guessing from a shared name (spec §4.3).
 *
 * Reuses IMPLEMENTS rather than inventing an OVERRIDES kind, so
 * `implementations_of` works on a method with no new query pattern and no
 * change to the fixed edge vocabulary in spec §6.1.
 */
import type { EdgeRow } from "../store/repos.js";

export interface SymbolLocation {
  file: string;
  qualifiedName: string;
}

/** Direct members of `typeName`: one segment deeper, not grandchildren. */
function directMembers(
  symbols: Map<string, SymbolLocation>,
  typeKey: string,
): Map<string, string> {
  const declaring = symbols.get(typeKey);
  const members = new Map<string, string>();
  if (!declaring) return members;

  const prefix = `${declaring.qualifiedName}.`;
  for (const [key, location] of symbols) {
    if (location.file !== declaring.file) continue;
    if (!location.qualifiedName.startsWith(prefix)) continue;
    const remainder = location.qualifiedName.slice(prefix.length);
    if (remainder.includes(".")) continue;
    members.set(remainder, key);
  }
  return members;
}

export function deriveMemberImplements(
  symbols: Map<string, SymbolLocation>,
  edges: EdgeRow[],
): EdgeRow[] {
  const derived: EdgeRow[] = [];
  const seen = new Set<string>();
  const memberCache = new Map<string, Map<string, string>>();

  const membersOf = (typeKey: string): Map<string, string> => {
    let members = memberCache.get(typeKey);
    if (!members) {
      members = directMembers(symbols, typeKey);
      memberCache.set(typeKey, members);
    }
    return members;
  };

  for (const edge of edges) {
    if (edge.kind !== "IMPLEMENTS" && edge.kind !== "INHERITS") continue;
    if (edge.srcKey === edge.dstKey) continue;

    const declared = membersOf(edge.dstKey);
    if (declared.size === 0) continue;
    const implemented = membersOf(edge.srcKey);

    for (const [name, declaredKey] of declared) {
      const implementedKey = implemented.get(name);
      if (!implementedKey || implementedKey === declaredKey) continue;

      const dedupe = `${implementedKey}|${declaredKey}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      derived.push({
        srcKey: implementedKey,
        dstKey: declaredKey,
        kind: "IMPLEMENTS",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: edge.siteLine,
      });
    }
  }

  return derived;
}
