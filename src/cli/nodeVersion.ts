/** better-sqlite3 requires this; below it, using the database segfaults. */
const MINIMUM_NODE_MAJOR = 22;

/**
 * Refuse to run on a Node too old for the bundled native module.
 *
 * On Node 20 `better-sqlite3` imports cleanly and then **segfaults when the
 * database is used** — exit 139, no output, no stack trace. Everything a user
 * would check first says the install worked: npm downgrades `EBADENGINE` to a
 * warning and exits 0, and `sonde --version` prints normally because it never
 * touches SQLite. The first real command then dies in silence.
 *
 * That is precisely the failure invariant 8 forbids, so the CLI states the
 * cause instead of crashing.
 *
 * Returns the message to print, or null when the version is acceptable. A
 * version that cannot be parsed is accepted: a guard that misfires would block
 * a user whose Node is fine, which is worse than the problem it prevents.
 */
export function unsupportedNodeMessage(version: string): string | null {
  const major = Number.parseInt(version.replace(/^v/, ""), 10);
  if (!Number.isFinite(major) || major >= MINIMUM_NODE_MAJOR) return null;
  return (
    `sonde requires Node ${MINIMUM_NODE_MAJOR} or newer, but this is Node ${version}.\n` +
    "The bundled better-sqlite3 segfaults on older versions, so sonde stops " +
    "here rather than crashing without explanation.\n" +
    `Upgrade Node (for example \`nvm install ${MINIMUM_NODE_MAJOR}\`), then ` +
    "reinstall: `npm install -g @cheppulabs/sonde`."
  );
}

/** Print and exit when the running Node cannot support the native module. */
export function assertSupportedNode(
  version: string = process.versions.node,
): void {
  const message = unsupportedNodeMessage(version);
  if (message === null) return;
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
