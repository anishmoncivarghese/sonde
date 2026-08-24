import { Parser } from "web-tree-sitter";

let initPromise: Promise<void> | null = null;

/**
 * The single call site for `Parser.init()`.
 *
 * `Parser.init()` bootstraps a shared WASM runtime by writing plain
 * module-level globals inside web-tree-sitter (`LANGUAGE_VERSION`,
 * `TRANSFER_BUFFER`) with no guard against concurrent invocation. Every
 * language adapter previously called it independently, which was invisible
 * because no test ever indexed a repository containing more than one
 * language. A real mixed repository — a Swift app with a TypeScript
 * marketing site is not a contrived case — starts both adapters together,
 * both call `Parser.init()` concurrently, and whichever grammar load loses
 * the race reads the other's half-written state: "Incompatible language
 * version 0". Memoizing the call here, shared by every adapter, makes the
 * race structurally impossible rather than empirically rare.
 */
export async function ensureTreeSitterRuntime(): Promise<void> {
  initPromise ??= Parser.init();
  await initPromise;
}
