/**
 * Fetch the large benchmark fixture: a pinned, permissively-licensed real
 * TypeScript repository.
 *
 * The fixture is NOT committed. Benchmarking against a repo we wrote ourselves
 * invites the objection that the corpus was shaped to suit the tool, and the
 * medium fixture (198 lines) is small enough that an agent simply reads all of
 * it — which cannot test whether structural retrieval beats exhaustive reading.
 *
 * Pinned by release tag AND tarball checksum so a run is reproducible and a
 * silently re-cut tag cannot change the corpus underneath a published number.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const FIXTURE = {
  name: "hono",
  version: "v4.6.3",
  license: "MIT",
  url: "https://codeload.github.com/honojs/hono/tar.gz/refs/tags/v4.6.3",
  sha256: "641d84eec2bf60e71d2199b32d084af7acf9735b10cdfb9b6feb21f9f4f9b164",
};

const root = process.cwd();
const dest = join(root, "tests", "fixtures", "repos", "large");

if (existsSync(join(dest, "src"))) {
  console.log(`fixture present: ${dest}`);
  process.exit(0);
}

const response = await fetch(FIXTURE.url);
if (!response.ok) throw new Error(`fetch failed: ${response.status} ${FIXTURE.url}`);
const bytes = Buffer.from(await response.arrayBuffer());

const digest = createHash("sha256").update(bytes).digest("hex");
if (digest !== FIXTURE.sha256) {
  throw new Error(
    `checksum mismatch for ${FIXTURE.name} ${FIXTURE.version}\n` +
      `  expected ${FIXTURE.sha256}\n  actual   ${digest}\n` +
      "Refusing to benchmark against an unverified corpus.",
  );
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
const tarball = join(dest, "fixture.tar.gz");
writeFileSync(tarball, bytes);
execFileSync("tar", ["xzf", tarball, "-C", dest]);
rmSync(tarball);

// Lift the single extracted directory up so paths are stable across versions.
const [extracted] = readdirSync(dest);
if (!extracted) throw new Error("archive contained nothing");
for (const entry of readdirSync(join(dest, extracted))) {
  renameSync(join(dest, extracted, entry), join(dest, entry));
}
rmSync(join(dest, extracted), { recursive: true, force: true });

writeFileSync(
  join(dest, "FIXTURE.json"),
  `${JSON.stringify({ ...FIXTURE, fetchedAt: new Date().toISOString() }, null, 2)}\n`,
);

console.log(`fetched ${FIXTURE.name} ${FIXTURE.version} (${FIXTURE.license}) -> ${dest}`);
