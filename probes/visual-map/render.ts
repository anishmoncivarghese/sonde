/**
 * Phase 0 throwaway renderer — probes/visual-map/PROTOCOL.md
 *
 * Emits one self-contained HTML module map from the existing index, so the
 * protocol's questions can be answered from a graph instead of a table.
 *
 * This is a spike. It is not a product, it designs no IR, it adds no CLI
 * command, and it may be deleted. Read PROTOCOL.md §4 before changing it, and
 * do not change the questions or thresholds once a result is seen.
 *
 * Two rules govern what is drawn, both inherited rather than invented:
 *
 * 1. `resolvedOf` (COMPILER + LEXICAL) governs thickness, ordering and default
 *    visibility -- never `total`. This repository's swift and typescript
 *    adapters share filenames and therefore function names, manufacturing 62
 *    "references" between modules that never import each other. A thickness
 *    heuristic on raw volume would put that pair front and centre.
 * 2. The renderer draws structure; it does not compute answers. There is
 *    deliberately no "cycles found" readout and no "riskiest module" ranking.
 *    Printing the answer to a protocol question into the artifact under test
 *    would measure this file's feature list, not whether a graph helps a
 *    reader see structure.
 */
import { writeFileSync } from "node:fs";
import { openDb } from "../../src/store/db.js";
import { migrate } from "../../src/store/migrate.js";
import { Store } from "../../src/store/index.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { gitState } from "../../src/repo/git.js";
import { checkDrift } from "../../src/index/drift.js";
import { indexPathFor } from "../../src/index/cache.js";
import { findNestedProjectRoots } from "../../src/doc/index.js";
import {
  buildModuleGraph,
  resolvedOf,
  type ModuleDependency,
  type ModuleGraph,
} from "../../src/doc/modules.js";

const repoPath = process.argv[2] ?? process.cwd();
const outPath = process.argv[3] ?? "probes/visual-map/map.html";

const db = openDb(indexPathFor(repoPath));
migrate(db);
const store = new Store(db);
const boundary = new RepoBoundary(repoPath);

const symbolCounts = store.docSymbolCounts();
// The same options `generateDoc` uses, via the same helper rather than a copy
// of it. Passing none counted three vendored fixture repositories as this
// repository's architecture, and the map's tier totals then disagreed with
// `sonde doc`'s stamp (1044/1861 against 1008/1821) -- a provenance claim that
// contradicts the tool it claims to visualise.
const graph = buildModuleGraph(store.docEdgeRows(), symbolCounts, {
  nestedProjectRoots: findNestedProjectRoots(
    boundary,
    symbolCounts.map((row) => row.filePath.split("/").slice(0, -1).join("/")),
  ),
});
const git = gitState(boundary);
const drift = checkDrift(boundary, store);

/**
 * Column assignment by longest path over the resolved subgraph.
 *
 * Deterministic and independent of insertion order, which matters because the
 * spike will be regenerated: a layout that moves between runs cannot be
 * compared against itself. Cycles are broken by an iteration cap rather than
 * by dropping an edge, so a cyclic pair stays visible as a pair.
 */
function assignRanks(modules: string[], edges: ModuleDependency[]): Map<string, number> {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const rank = new Map<string, number>(modules.map((m) => [m, 0]));
  for (let pass = 0; pass < modules.length; pass++) {
    let changed = false;
    for (const module of [...modules].sort()) {
      for (const target of (outgoing.get(module) ?? []).slice().sort()) {
        const candidate = (rank.get(module) ?? 0) + 1;
        if (candidate > (rank.get(target) ?? 0) && candidate < modules.length) {
          rank.set(target, candidate);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return rank;
}

interface Node {
  path: string;
  files: number;
  symbols: number;
  surface: string[];
  x: number;
  y: number;
  r: number;
}

const resolvedEdges = graph.dependencies.filter((d) => resolvedOf(d) > 0);
const unverifiedEdges = graph.dependencies.filter((d) => resolvedOf(d) === 0);

// Every module, including those with no dependency at all. Dropping an
// isolated module would silently shrink the architecture the reader is
// comparing against the Markdown, which lists all of them.
const modulePaths = graph.modules.map((m) => m.path);
const ranks = assignRanks(modulePaths, resolvedEdges);

// Compact the ranks to consecutive columns. Longest-path ranking over a
// cyclic graph leaves wide gaps -- this repository reached rank 31 with only
// eight ranks occupied, which stretched the canvas to 8460px of mostly empty
// space and squashed the graph into an unreadable band.
const occupied = [...new Set(modulePaths.map((p) => ranks.get(p) ?? 0))]
  .sort((a, b) => a - b);
const column = new Map(occupied.map((rank, index) => [rank, index]));

const byRank = new Map<number, string[]>();
for (const path of [...modulePaths].sort()) {
  const rank = column.get(ranks.get(path) ?? 0) ?? 0;
  byRank.set(rank, [...(byRank.get(rank) ?? []), path]);
}

const COL = 260;
const ROW = 86;
const PAD = 70;
const maxRank = Math.max(0, ...byRank.keys());
const maxRows = Math.max(1, ...[...byRank.values()].map((c) => c.length));
const width = PAD * 2 + COL * (maxRank + 1);
const height = PAD * 2 + ROW * maxRows;

const maxSymbols = Math.max(1, ...graph.modules.map((m) => m.symbols));
const nodes: Node[] = [];
for (const [rank, column] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
  const offset = (maxRows - column.length) / 2;
  column.forEach((path, row) => {
    const summary = graph.modules.find((m) => m.path === path);
    const symbols = summary?.symbols ?? 0;
    nodes.push({
      path,
      files: summary?.files ?? 0,
      symbols,
      surface: summary?.surface ?? [],
      x: PAD + rank * COL,
      y: PAD + (offset + row) * ROW + ROW / 2,
      // Area, not radius, tracks symbol count -- a radius-linear scale makes a
      // module four times the size look sixteen times heavier.
      r: 10 + 22 * Math.sqrt(symbols / maxSymbols),
    });
  });
}

const maxResolved = Math.max(1, ...resolvedEdges.map(resolvedOf));

const payload = {
  nodes,
  edges: [
    ...resolvedEdges.map((e) => ({
      from: e.from,
      to: e.to,
      resolved: resolvedOf(e),
      total: e.total,
      byTier: e.byTier,
      // Three states, not two. `resolvedOf > 0` is too coarse on its own: the
      // typescript -> swift pair carries 1 LEXICAL reference against 38
      // heuristic name matches, and drawing that identically to a 68-reference
      // compiler-resolved edge is exactly the misreading PROTOCOL.md 4.1
      // requires this spike to avoid. The split is on evidence majority -- a
      // stated rule rather than a tuned cut-off.
      evidence:
        resolvedOf(e) > e.byTier.HEURISTIC ? "resolved" : "weak",
      weight: 1 + 5 * (resolvedOf(e) / maxResolved),
    })),
    ...unverifiedEdges.map((e) => ({
      from: e.from,
      to: e.to,
      resolved: 0,
      total: e.total,
      byTier: e.byTier,
      evidence: "unverified",
      weight: 1,
    })),
  ],
  stamp: {
    revision: git.revision,
    dirty: git.dirty,
    driftedFiles: drift.driftCount,
    tierTotals: graph.tierTotals,
    unverifiedPairs: graph.unverifiedPairs,
    excludedTestModules: graph.excludedTestModules,
    totalModules: graph.modules.length,
    drawnModules: nodes.length,
  },
  layout: { width, height },
};

const html = `<!doctype html>
<meta charset="utf-8">
<title>Module map — spike</title>
<style>
  :root { color-scheme: light dark; --bg:#fbfbfa; --fg:#1b1b19; --line:#8a8a85;
          --panel:#ffffff; --border:#d8d8d4; --accent:#2f6f4f; --warn:#8a5a1a; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#17181a; --fg:#e8e8e4; --line:#6e6f73; --panel:#202225;
            --border:#34363a; --accent:#7fc3a0; --warn:#d7a45e; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5
         ui-sans-serif, system-ui, sans-serif; }
  header { padding:12px 16px; border-bottom:1px solid var(--border);
           display:flex; flex-wrap:wrap; gap:16px; align-items:baseline; }
  h1 { font-size:15px; margin:0; font-weight:600; }
  .meta { font:12px/1.4 ui-monospace, monospace; color:var(--line); }
  label { font-size:12px; display:inline-flex; gap:6px; align-items:center; }
  main { display:flex; min-height:calc(100vh - 54px); }
  #canvas { flex:1; overflow:hidden; position:relative; }
  #canvas svg { width:100%; height:100%; display:block; cursor:grab; }
  #canvas svg.panning { cursor:grabbing; }
  #zoom { position:absolute; right:10px; bottom:10px; display:flex; gap:4px; }
  #zoom button { font:13px ui-monospace,monospace; width:28px; height:28px;
    border:1px solid var(--border); background:var(--panel); color:var(--fg);
    border-radius:4px; cursor:pointer; }
  aside { width:300px; flex:none; border-left:1px solid var(--border);
          background:var(--panel); padding:14px 16px; overflow:auto; }
  aside h2 { font:600 13px/1.4 ui-monospace, monospace; margin:0 0 8px;
             word-break:break-all; }
  aside dl { display:grid; grid-template-columns:auto 1fr; gap:2px 10px;
             margin:0 0 14px; font-size:13px; }
  aside dt { color:var(--line); }
  aside section { border-top:1px solid var(--border); padding-top:10px;
                  margin-top:10px; }
  aside h3 { font-size:12px; text-transform:uppercase; letter-spacing:.05em;
             color:var(--line); margin:0 0 6px; }
  aside ul { margin:0; padding-left:16px; font:12px/1.6 ui-monospace, monospace; }
  .warn { color:var(--warn); }
  .node { cursor:pointer; }
  .node circle { fill:var(--panel); stroke:var(--fg); stroke-width:1.5; }
  .node text { font:11px ui-monospace, monospace; fill:var(--fg);
               pointer-events:none; }
  .edge { fill:none; stroke:var(--line); }
  .edge.weak { stroke-dasharray:7 3; stroke:var(--warn); opacity:.85; }
  .edge.unverified { stroke-dasharray:2 5; stroke:var(--warn); opacity:.5; }
  .dim { opacity:.1; }
  .hot circle { stroke:var(--accent); stroke-width:3; }
  .edge.hot { stroke:var(--accent); opacity:1; }
  @media (max-width:760px) {
    main { flex-direction:column; }
    aside { width:auto; border-left:0; border-top:1px solid var(--border); }
  }
</style>
<header>
  <h1>Module map <span class="meta">(Phase 0 spike)</span></h1>
  <span class="meta" id="stamp"></span>
  <label><input type="checkbox" id="showUnverified"> show unverified pairs
    (<span id="unverifiedCount"></span>)</label>
  <span class="meta">solid = resolved majority &middot; long dash = weak
    (heuristic majority) &middot; short dash = unverified (0 resolved)</span>
</header>
<main>
  <div id="canvas"></div>
  <aside id="panel"><p class="meta">Click a module.</p></aside>
</main>
<script id="data" type="application/json">${JSON.stringify(payload)}</script>
<script>
const data = JSON.parse(document.getElementById("data").textContent);
const NS = "http://www.w3.org/2000/svg";
const pos = new Map(data.nodes.map(n => [n.path, n]));
const s = data.stamp;
document.getElementById("unverifiedCount").textContent =
  data.edges.filter(e => e.evidence === "unverified").length;
document.getElementById("stamp").textContent =
  (s.revision ? s.revision.slice(0,7) : "no revision") +
  (s.dirty ? " (dirty worktree)" : "") +
  " · " + s.driftedFiles + " drifted file(s)" +
  " · " + s.drawnModules + " modules" +
  " · " + s.excludedTestModules + " all-test module(s) excluded" +
  " · resolved " + (s.tierTotals.COMPILER + s.tierTotals.LEXICAL) +
  " / heuristic " + s.tierTotals.HEURISTIC;

function el(name, attrs, text) {
  const node = document.createElementNS(NS, name);
  for (const [k,v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// The whole graph must be visible at once. A map that only shows a scroll
// window of itself is a worse table, and would fail this spike for a reason
// that has nothing to do with whether graphs help.
const view = { x:0, y:0, w:data.layout.width, h:data.layout.height };
const svg = el("svg", { viewBox: "0 0 "+view.w+" "+view.h,
                        preserveAspectRatio: "xMidYMid meet" });
function applyView() {
  svg.setAttribute("viewBox", view.x+" "+view.y+" "+view.w+" "+view.h);
}
function zoom(factor, originX, originY) {
  const nw = Math.max(200, Math.min(data.layout.width * 4, view.w * factor));
  const scale = nw / view.w;
  view.x = originX - (originX - view.x) * scale;
  view.y = originY - (originY - view.y) * scale;
  view.w = nw;
  view.h = view.h * scale;
  applyView();
}
const defs = el("defs", {});
for (const [id, color] of [["a","var(--line)"],["aw","var(--warn)"],["ah","var(--accent)"]]) {
  const m = el("marker", { id, viewBox:"0 0 10 10", refX:"9", refY:"5",
    markerWidth:"6", markerHeight:"6", orient:"auto-start-reverse" });
  m.appendChild(el("path", { d:"M0,0 L10,5 L0,10 z", fill: color }));
  defs.appendChild(m);
}
svg.appendChild(defs);

const edgeLayer = el("g", {});
const nodeLayer = el("g", {});
svg.appendChild(edgeLayer);
svg.appendChild(nodeLayer);

// A pair drawn in both directions gets a visible bow in each direction, so a
// mutual dependency reads as two arcs rather than one line with two heads.
const mutual = new Set();
for (const e of data.edges) {
  if (data.edges.some(o => o.from === e.to && o.to === e.from)) {
    mutual.add(e.from + "\\u0000" + e.to);
  }
}

const edgeEls = [];
for (const e of data.edges) {
  const a = pos.get(e.from), b = pos.get(e.to);
  if (!a || !b) continue;
  const bow = mutual.has(e.from + "\\u0000" + e.to) ? 38 : 0;
  const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
  const dx = b.x-a.x, dy = b.y-a.y;
  const len = Math.hypot(dx,dy) || 1;
  const cx = mx - (dy/len)*(bow || Math.min(60, len*0.12));
  const cy = my + (dx/len)*(bow || Math.min(60, len*0.12));
  const path = el("path", {
    d: "M"+a.x+","+a.y+" Q"+cx+","+cy+" "+b.x+","+b.y,
    class: "edge" + (e.evidence === "resolved" ? "" : " " + e.evidence),
    "stroke-width": e.weight,
    "marker-end": "url(#" + (e.evidence === "resolved" ? "a" : "aw") + ")",
  });
  path.appendChild(el("title", {},
    e.from + " \\u2192 " + e.to + "\\n" +
    (e.evidence === "unverified"
      ? "UNVERIFIED: " + e.total + " heuristic name match(es), 0 resolved \\u2014 " +
        "shared symbol names are not evidence of a dependency"
      : (e.evidence === "weak" ? "WEAK: " : "") +
        e.resolved + " resolved reference(s) (COMPILER " + e.byTier.COMPILER +
        ", LEXICAL " + e.byTier.LEXICAL + "), " + e.byTier.HEURISTIC + " heuristic" +
        (e.evidence === "weak"
          ? " \\u2014 most of this pair's references are name matches, not uses"
          : ""))));
  edgeLayer.appendChild(path);
  edgeEls.push({ e, path });
}

const nodeEls = [];
for (const n of data.nodes) {
  const g = el("g", { class: "node", tabindex: "0" });
  g.appendChild(el("circle", { cx:n.x, cy:n.y, r:n.r }));
  g.appendChild(el("text", { x:n.x, y:n.y + n.r + 13, "text-anchor":"middle" },
                  n.path.replace(/^src\\//, "")));
  g.appendChild(el("title", {}, n.path + "\\n" + n.files + " file(s), " + n.symbols + " symbol(s)"));
  const select = () => show(n);
  g.addEventListener("click", select);
  g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(); } });
  nodeLayer.appendChild(g);
  nodeEls.push({ n, g });
}
const canvas = document.getElementById("canvas");
canvas.appendChild(svg);

function toSvg(ev) {
  const box = svg.getBoundingClientRect();
  return {
    x: view.x + ((ev.clientX - box.left) / box.width) * view.w,
    y: view.y + ((ev.clientY - box.top) / box.height) * view.h,
  };
}
svg.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const at = toSvg(ev);
  zoom(ev.deltaY > 0 ? 1.12 : 1 / 1.12, at.x, at.y);
}, { passive: false });

let drag = null;
svg.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest(".node")) return;
  drag = { ...toSvg(ev), id: ev.pointerId };
  svg.setPointerCapture(ev.pointerId);
  svg.classList.add("panning");
});
svg.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const at = toSvg(ev);
  view.x -= at.x - drag.x;
  view.y -= at.y - drag.y;
  applyView();
});
for (const name of ["pointerup", "pointercancel"]) {
  svg.addEventListener(name, () => { drag = null; svg.classList.remove("panning"); });
}

const zoomBar = document.createElement("div");
zoomBar.id = "zoom";
for (const [label, run] of [
  ["+", () => zoom(1 / 1.3, view.x + view.w / 2, view.y + view.h / 2)],
  ["\u2212", () => zoom(1.3, view.x + view.w / 2, view.y + view.h / 2)],
  ["\u2302", () => { view.x = 0; view.y = 0; view.w = data.layout.width;
                      view.h = data.layout.height; applyView(); }],
]) {
  const button = document.createElement("button");
  button.textContent = label;
  button.title = label === "\u2302" ? "fit" : "zoom";
  button.addEventListener("click", run);
  zoomBar.appendChild(button);
}
canvas.appendChild(zoomBar);

const showUnverified = document.getElementById("showUnverified");
function applyVisibility() {
  const on = showUnverified.checked;
  for (const { e, path } of edgeEls) {
    if (e.evidence === "unverified") path.style.display = on ? "" : "none";
  }
}
showUnverified.addEventListener("change", () => { applyVisibility(); clear(); });
applyVisibility();

function clear() {
  for (const { g } of nodeEls) g.classList.remove("dim","hot");
  for (const { path } of edgeEls) path.classList.remove("dim","hot");
}

function visible(e) { return e.evidence !== "unverified" || showUnverified.checked; }

function show(n) {
  clear();
  const touching = edgeEls.filter(({e}) => visible(e) && (e.from === n.path || e.to === n.path));
  const near = new Set([n.path]);
  for (const { e } of touching) { near.add(e.from); near.add(e.to); }
  for (const { n: m, g } of nodeEls) {
    if (!near.has(m.path)) g.classList.add("dim");
    else if (m.path === n.path) g.classList.add("hot");
  }
  for (const { e, path } of edgeEls) {
    if (!visible(e)) continue;
    if (e.from === n.path || e.to === n.path) {
      path.classList.add("hot");
      path.setAttribute("marker-end", "url(#ah)");
    } else {
      path.classList.add("dim");
      path.setAttribute("marker-end", "url(#" + (e.evidence === "resolved" ? "a" : "aw") + ")");
    }
  }

  const out = touching.filter(({e}) => e.from === n.path);
  const inn = touching.filter(({e}) => e.to === n.path);
  const row = ({e}) => {
    const other = e.from === n.path ? e.to : e.from;
    if (e.evidence === "resolved") {
      return "<li>" + other + " <span class=meta>(" + e.resolved + " resolved)</span></li>";
    }
    if (e.evidence === "weak") {
      return "<li class=warn>" + other + " <span class=meta>(weak: " + e.resolved +
             " resolved vs " + e.byTier.HEURISTIC + " heuristic)</span></li>";
    }
    return "<li class=warn>" + other + " <span class=meta>(unverified: " + e.total +
           " name matches)</span></li>";
  };
  document.getElementById("panel").innerHTML =
    "<h2>" + n.path + "</h2>" +
    "<dl><dt>files</dt><dd>" + n.files + "</dd>" +
        "<dt>symbols</dt><dd>" + n.symbols + "</dd></dl>" +
    "<section><h3>Depends on (" + out.length + ")</h3><ul>" +
      (out.map(row).join("") || "<li class=meta>nothing</li>") + "</ul></section>" +
    "<section><h3>Depended on by (" + inn.length + ")</h3><ul>" +
      (inn.map(row).join("") || "<li class=meta>nothing</li>") + "</ul></section>" +
    (n.surface.length
      ? "<section><h3>Surface</h3><ul>" +
        n.surface.slice(0,20).map(x => "<li>" + x + "</li>").join("") +
        (n.surface.length > 20 ? "<li class=meta>+" + (n.surface.length-20) + " more</li>" : "") +
        "</ul></section>"
      : "");
}
</script>
`;

writeFileSync(outPath, html);
console.log(
  `wrote ${outPath}\n` +
  `  modules drawn: ${nodes.length} of ${graph.modules.length}\n` +
  `  resolved edges: ${resolvedEdges.length}\n` +
  `  unverified pairs (hidden by default): ${unverifiedEdges.length}\n` +
  `  revision: ${git.revision?.slice(0, 7) ?? "none"}${git.dirty ? " (dirty)" : ""}\n` +
  `  drifted files: ${drift.driftCount}`,
);
