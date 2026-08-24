// Downloads prebuilt tree-sitter WASM grammars into vendor/.
// Pinned by version and checksum so the extractor_manifest_hash is meaningful.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GRAMMARS = [
  {
    name: "tree-sitter-typescript.wasm",
    url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-typescript.wasm",
    sha256: "8515404dceed38e1ed86aa34b09fcf3379fff1b4ff9dd3967bcd6d1eb5ac3d8f",
  },
  {
    name: "tree-sitter-tsx.wasm",
    url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-tsx.wasm",
    sha256: "6aa3b2c70e76f5d48eafef1093e9c4de383e13f2fdde2f4e9b98a378f6a8f1b6",
  },
  {
    name: "tree-sitter-swift.wasm",
    url: "https://github.com/alex-pinkus/tree-sitter-swift/releases/download/0.7.3/tree-sitter-swift.wasm",
    sha256: "0258a7ef17303a8079ffe0748b3583d59656b5c3e8653fca7b6451b3e6689eb2",
  },
];

const dir = join(process.cwd(), "vendor");
mkdirSync(dir, { recursive: true });

for (const g of GRAMMARS) {
  const dest = join(dir, g.name);
  let bytes;
  let state;
  if (existsSync(dest)) {
    bytes = readFileSync(dest);
    state = "cached";
  } else {
    const res = await fetch(g.url);
    if (!res.ok) throw new Error(`failed to fetch ${g.name}: ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
    state = "fetched";
  }

  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== g.sha256) {
    throw new Error(
      `checksum mismatch for ${g.name}: expected ${g.sha256}, got ${actual}`,
    );
  }

  if (state === "fetched") writeFileSync(dest, bytes);
  console.log(state, g.name, "sha256 verified");
}
