import type { LanguageAdapter } from "./types.js";
import { swiftAdapter } from "./swift/index.js";
import { getSwiftParser } from "./swift/parser.js";
import { typescriptAdapter } from "./typescript/index.js";
import { getTsParser } from "./typescript/parser.js";

interface Registration {
  adapter: LanguageAdapter;
  initialize: () => Promise<unknown>;
}

const registrations: readonly Registration[] = [
  { adapter: typescriptAdapter, initialize: getTsParser },
  { adapter: swiftAdapter, initialize: getSwiftParser },
];

export function adapterForPath(path: string): LanguageAdapter | null {
  return registrations.find(({ adapter }) => adapter.matches(path))?.adapter ??
    null;
}

/** Warm only parsers selected for this repository before synchronous extract. */
export async function initializeAdapters(
  adapters: Iterable<LanguageAdapter>,
): Promise<void> {
  const selected = new Set(adapters);
  await Promise.all(
    registrations
      .filter(({ adapter }) => selected.has(adapter))
      .map(({ initialize }) => initialize()),
  );
}
