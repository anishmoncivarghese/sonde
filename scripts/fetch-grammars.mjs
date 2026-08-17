// Downloads prebuilt tree-sitter WASM grammars into vendor/.
// Pinned by version so the extractor_manifest_hash is meaningful.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const GRAMMARS = [
  { name: "tree-sitter-typescript.wasm", url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-typescript.wasm" },
  { name: "tree-sitter-tsx.wasm",        url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-tsx.wasm" },
  { name: "tree-sitter-swift.wasm",      url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-swift.wasm" },
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
