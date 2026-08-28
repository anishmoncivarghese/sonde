import { fileURLToPath } from "node:url";
import { getPythonParser, pythonParser } from "../adapters/python/parser.js";
import { extractPythonReferences } from "../adapters/python/references.js";
import { extractPythonSymbols } from "../adapters/python/symbols.js";
import { RepoBoundary } from "../repo/boundary.js";
import { discover } from "../repo/discover.js";
import type { Store } from "../store/index.js";
import type { EdgeKind } from "../store/repos.js";
import {
  openPyrightSession,
  type DefinitionQuery,
} from "./pyrightClient.js";
import { pythonSymbolAt } from "./pythonSymbolAt.js";

export interface PyrightPassResult {
  upgraded: number;
  externalized: number;
  unresolvedCleared: number;
  /** Name-wide unresolved deletion beyond the successfully answered sites. */
  extraUnresolvedCleared: number;
  queries: number;
  answered: number;
  skippedNullSites: number;
  unmatchedSites: number;
  pyrightVersion: string;
  warnings: string[];
}

export interface PyrightPassUnavailable {
  unavailable: true;
  reason: string;
  queries: number;
  answered: number;
}

const REQUEST_TIMEOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 10 * 60_000;
const KEY_SEPARATOR = "\u0000";

interface QuerySite {
  srcKey: string;
  name: string;
  siteLine: number;
  kind: EdgeKind;
  wasUnresolved: boolean;
}

type SuccessfulAction =
  | { kind: "in-repo"; site: QuerySite; dstKey: string }
  | { kind: "external"; site: QuerySite; packageOrLib: string };

function siteKey(srcKey: string, siteLine: number, name: string): string {
  return `${srcKey}${KEY_SEPARATOR}${siteLine}${KEY_SEPARATOR}${name}`;
}

function unavailable(
  reason: string,
  queries = 0,
  answered = 0,
): PyrightPassUnavailable {
  return { unavailable: true, reason, queries, answered };
}

function packageOrLibFromUri(uri: string): string {
  let path = uri;
  try {
    path = fileURLToPath(uri);
  } catch {
    // Non-file definition URIs still constitute external compiler evidence.
  }
  const normalized = path.replaceAll("\\", "/");
  if (normalized.toLowerCase().includes("typeshed")) return "typeshed";
  const match = /\/site-packages\/([^/]+)/i.exec(normalized);
  return match?.[1] ?? "external";
}

/** Promote only unresolved or heuristic Python sites answered by pyright. */
export async function runPyrightPass(
  root: string,
  store: Store,
): Promise<PyrightPassResult | PyrightPassUnavailable | null> {
  let session: Awaited<ReturnType<typeof openPyrightSession>> | null = null;
  let queryCount = 0;
  let answered = 0;

  try {
    // Python is deliberately unregistered until the placement gate passes, so
    // the pass must warm its parser itself (independent review I6).
    await getPythonParser();
    const boundary = new RepoBoundary(root);
    const files = discover(boundary, {
      hashContent: false,
      extensions: new Set([".py", ".pyi"]),
    }).map((file) => file.path);
    if (files.length === 0) return null;

    const unresolvedKeys = new Set<string>();
    const wanted = new Set<string>();
    let skippedNullSites = 0;
    for (const site of store.unresolvedRefSites()) {
      if (site.siteLine === null) {
        skippedNullSites += 1;
        continue;
      }
      const key = siteKey(site.srcKey, site.siteLine, site.name);
      unresolvedKeys.add(key);
      wanted.add(key);
    }
    for (const site of store.heuristicEdgeSites()) {
      if (site.siteLine === null) {
        skippedNullSites += 1;
        continue;
      }
      wanted.add(siteKey(site.srcKey, site.siteLine, site.name));
    }

    if (wanted.size === 0) {
      return skippedNullSites === 0
        ? null
        : unavailable(
            `${skippedNullSites} pyright query site(s) have NULL site_line`,
          );
    }

    const queries: DefinitionQuery[] = [];
    const sites: QuerySite[] = [];
    const matched = new Set<string>();
    for (const file of files) {
      const source = boundary.readFile(file).toString("utf8");
      const tree = pythonParser().parse(source);
      if (!tree) continue;
      const symbols = extractPythonSymbols(file, source, tree);
      for (const ref of extractPythonReferences(file, source, tree, symbols)) {
        const key = siteKey(ref.fromSymbolKey, ref.siteLine, ref.name);
        if (!wanted.has(key) || matched.has(key)) continue;
        // spec §4.1: compiler-grade evidence requires the exact identifier
        // column. Never recover it by searching source text.
        if (ref.siteColumn === undefined) continue;
        matched.add(key);
        queries.push({
          file,
          line: ref.siteLine - 1,
          character: ref.siteColumn,
        });
        sites.push({
          srcKey: ref.fromSymbolKey,
          name: ref.name,
          siteLine: ref.siteLine,
          kind: ref.kind,
          wasUnresolved: unresolvedKeys.has(key),
        });
      }
    }

    const unmatchedSites = wanted.size - matched.size;
    const warnings: string[] = [];
    if (skippedNullSites > 0) {
      warnings.push(
        `${skippedNullSites} pyright query site(s) skipped: NULL site_line`,
      );
    }
    if (unmatchedSites > 0) {
      warnings.push(
        `${unmatchedSites} stored pyright query site(s) did not match extraction`,
      );
    }
    if (queries.length === 0) {
      return unavailable(warnings.join("; ") || "no query sites were extractable");
    }
    queryCount = queries.length;

    session = await openPyrightSession(boundary, files, {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      sessionTimeoutMs: SESSION_TIMEOUT_MS,
    });
    const answers = await session.definitions(queries);
    if (session.failureReason) {
      return unavailable(session.failureReason, queryCount, answered);
    }
    if (answers.length !== queries.length) {
      return unavailable(
        `pyright returned ${answers.length} answers for ${queries.length} queries`,
        queryCount,
        answered,
      );
    }

    const actions: SuccessfulAction[] = [];
    for (const [index, target] of answers.entries()) {
      const site = sites[index];
      if (!site || target.kind === "none") continue;
      answered += 1;

      if (target.kind === "external") {
        actions.push({
          kind: "external",
          site,
          packageOrLib: packageOrLibFromUri(target.uri),
        });
        continue;
      }

      let targetSource: string;
      try {
        targetSource = boundary.readFile(target.file).toString("utf8");
      } catch {
        continue;
      }
      const dstKey = pythonSymbolAt(
        target.file,
        targetSource,
        target.line + 1,
      );
      if (!dstKey || dstKey === site.srcKey) continue;
      actions.push({ kind: "in-repo", site, dstKey });
    }

    const pyrightVersion = session.pyrightVersion;
    return store.transaction(() => {
      const result: PyrightPassResult = {
        upgraded: 0,
        externalized: 0,
        unresolvedCleared: 0,
        extraUnresolvedCleared: 0,
        queries: queryCount,
        answered,
        skippedNullSites,
        unmatchedSites,
        pyrightVersion,
        warnings,
      };
      const successfulSites: QuerySite[] = [];

      for (const action of actions) {
        const { site } = action;
        if (action.kind === "external") {
          store.deleteHeuristicEdgesAt(
            site.srcKey,
            site.kind,
            site.siteLine,
            null,
          );
          store.insertExternal([
            {
              srcKey: site.srcKey,
              name: site.name,
              packageOrLib: action.packageOrLib,
              siteLine: site.siteLine,
            },
          ]);
          result.externalized += 1;
          successfulSites.push(site);
          continue;
        }

        const promoted = store.upgradeEdgeTierAt(
          site.srcKey,
          action.dstKey,
          site.kind,
          site.siteLine,
        );
        const inserted = promoted
          ? false
          : store.insertCompilerEdgeAt(
              site.srcKey,
              action.dstKey,
              site.kind,
              site.siteLine,
            );
        const exists =
          promoted ||
          inserted ||
          store.hasCompilerEdgeAt(
            site.srcKey,
            action.dstKey,
            site.kind,
            site.siteLine,
          );
        if (!exists) continue;

        // One compiler answer replaces every heuristic ambiguity candidate at
        // this exact reference site. Leaving them would double-count C1 sites.
        store.deleteHeuristicEdgesAt(
          site.srcKey,
          site.kind,
          site.siteLine,
          action.dstKey,
        );
        result.upgraded += 1;
        successfulSites.push(site);
      }

      // The current schema can only delete by (source, name), not by line.
      // Count any collateral deletion explicitly (independent review I9).
      const groups = new Map<string, { site: QuerySite; expected: number }>();
      for (const site of successfulSites) {
        if (!site.wasUnresolved) continue;
        const key = `${site.srcKey}${KEY_SEPARATOR}${site.name}`;
        const group = groups.get(key);
        if (group) group.expected += 1;
        else groups.set(key, { site, expected: 1 });
      }
      for (const { site, expected } of groups.values()) {
        const removed = store.deleteUnresolvedFor(site.srcKey, site.name);
        result.unresolvedCleared += removed;
        result.extraUnresolvedCleared += Math.max(0, removed - expected);
      }

      return result;
    });
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : String(error),
      queryCount,
      answered,
    );
  } finally {
    session?.close();
  }
}
