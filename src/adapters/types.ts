import type { SymbolKind } from "../store/repos.js";

export type SymbolVisibility =
  | "private"
  | "fileprivate"
  | "internal"
  | "public"
  | "open";

export interface SymbolRecord {
  stableKey: string;
  qualifiedName: string;
  shortName: string;
  kind: SymbolKind;
  signature: string | null;
  startByte: number; endByte: number;
  startLine: number; endLine: number;
  bodyHash: string | null;
  exported: boolean;
  isTest: boolean;
  visibility?: SymbolVisibility;
}

export interface ScopeHint {
  module: string | null;
  file: string;
  visibility: SymbolVisibility | null;
  receiver: string | null;
  /** Receiver type only when written explicitly in source; never inferred. */
  receiverType: string | null;
}

/** A reference the adapter saw but cannot resolve — resolution is not the adapter's job. */
export interface ReferenceRecord {
  fromSymbolKey: string;   // enclosing NAMED symbol (spec §6.2)
  name: string;            // the identifier as written
  receiver: string | null; // for `x.foo()`, "x"; null for a bare `foo()`
  /** Optional language-specific module/target/access scope for candidate narrowing. */
  scopeHint?: ScopeHint;
  kind: "CALLS" | "REFERENCES" | "IMPLEMENTS" | "INHERITS";
  siteLine: number;
  /** 0-based identifier column; adapters populate it only when exact. */
  siteColumn?: number;
}

export interface ImportRecord {
  localName: string;       // name bound in this file
  importedName: string;    // name in the source module; "default" or "*" as applicable
  specifier: string;       // raw module specifier
  siteLine: number;
}

export interface ExportRecord {
  exportedName: string;       // "default" for default exports
  localName: string | null;   // local/source name; null only when no name exists (e.g. `export *`)
  reExportFrom: string | null;// specifier for `export ... from`
  isStar: boolean;            // `export * from`
  siteLine: number;
}

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  line: number;
}

export interface ExtractResult {
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  imports: ImportRecord[];
  exports: ExportRecord[];
  diagnostics: Diagnostic[];
}

export interface LanguageAdapter {
  readonly language: string;
  readonly extractorVersion: string;
  matches(path: string): boolean;
  /** MUST be pure: no I/O, no global state, no cross-file lookups. */
  extract(path: string, bytes: Uint8Array): ExtractResult;
}
