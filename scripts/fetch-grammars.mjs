// Downloads prebuilt tree-sitter WASM grammars into vendor/.
// Pinned by version so the extractor_manifest_hash is meaningful.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Swift is deliberately absent until the v0.2 adapter exists.
//
// The grammar nothing loads still costs every user 3.1MB on install — 38% of
// the published package. The build that used to be vendored here
// (tree-sitter-wasms 0.1.12) is also the wrong one: it predates Swift macros,
// flags 39% of files in a real Swift application, and cannot be loaded by V8's
// optimising WASM tier without --liftoff-only. The adapter should vendor
// alex-pinkus/tree-sitter-swift 0.7.3, which flags 8% and loads normally.
const GRAMMARS = [
  { name: "tree-sitter-typescript.wasm", url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-typescript.wasm" },
  { name: "tree-sitter-tsx.wasm",        url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-tsx.wasm" },
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
