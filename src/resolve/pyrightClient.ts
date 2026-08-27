// A minimal, serial LSP client for the bundled pyright language server.
import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RepoBoundary } from "../repo/boundary.js";

export interface DefinitionQuery {
  file: string;
  line: number;
  character: number;
}

export type DefinitionResult =
  | { kind: "in-repo"; file: string; line: number; character: number }
  | { kind: "external"; uri: string }
  | { kind: "none" };

export interface PyrightSessionOptions {
  requestTimeoutMs: number;
  sessionTimeoutMs: number;
}

export interface PyrightSession {
  pyrightVersion: string;
  readonly failureReason: string | null;
  definitions(queries: DefinitionQuery[]): Promise<DefinitionResult[]>;
  close(): void;
}

interface PendingRequest {
  resolve: (message: RpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

interface LspLocation {
  uri?: string;
  targetUri?: string;
  range?: LspRange;
  targetSelectionRange?: LspRange;
  targetRange?: LspRange;
}

interface LspRange {
  start?: { line?: number; character?: number };
}

const require = createRequire(import.meta.url);

function firstLocation(value: unknown): LspLocation | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "object" && candidate !== null
    ? (candidate as LspLocation)
    : null;
}

export async function openPyrightSession(
  boundary: RepoBoundary,
  files: string[],
  options: PyrightSessionOptions,
): Promise<PyrightSession> {
  const langserver = require.resolve("pyright/langserver.index.js");
  const pyrightVersion = String(
    (
      JSON.parse(
        readFileSync(require.resolve("pyright/package.json"), "utf8"),
      ) as { version: unknown }
    ).version,
  );

  const server: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    [langserver, "--stdio"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  server.stderr.on("data", () => {
    // stderr is diagnostic chatter; JSON-RPC is exclusively on stdout.
  });

  const pending = new Map<number, PendingRequest>();
  const deadline = Date.now() + options.sessionTimeoutMs;
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  let closed = false;
  let currentFailure: string | null = null;

  const rejectPending = (reason: string): void => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(reason));
    }
    pending.clear();
  };

  const fail = (reason: string): void => {
    currentFailure ??= reason;
    rejectPending(currentFailure);
  };

  server.on("error", (error) => {
    if (!closed) fail(`pyright language server error: ${error.message}`);
  });
  server.on("exit", (code, signal) => {
    if (!closed) {
      fail(
        `pyright language server exited early ` +
          `(code ${String(code)}, signal ${String(signal)})`,
      );
    }
  });

  server.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        fail("pyright sent a malformed JSON-RPC header");
        return;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);

      let message: RpcResponse;
      try {
        message = JSON.parse(body) as RpcResponse;
      } catch {
        fail("pyright sent malformed JSON-RPC JSON");
        return;
      }
      if (typeof message.id !== "number") continue;
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      clearTimeout(request.timer);
      request.resolve(message);
    }
  });

  const close = (): void => {
    if (closed) return;
    closed = true;
    rejectPending("pyright session closed");
    server.kill();
  };

  const send = (payload: unknown): void => {
    if (closed || !server.stdin.writable) {
      throw new Error("pyright session is closed");
    }
    const text = JSON.stringify(payload);
    server.stdin.write(
      `Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`,
    );
  };

  const request = (method: string, params: unknown): Promise<RpcResponse> => {
    if (currentFailure) return Promise.reject(new Error(currentFailure));
    if (closed) return Promise.reject(new Error("pyright session is closed"));

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const reason = `pyright session timed out after ${options.sessionTimeoutMs}ms`;
      fail(reason);
      return Promise.reject(new Error(reason));
    }

    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = Math.min(options.requestTimeoutMs, remaining);
      const timer = setTimeout(() => {
        pending.delete(id);
        const reason =
          Date.now() >= deadline
            ? `pyright session timed out after ${options.sessionTimeoutMs}ms`
            : `pyright request timed out after ${options.requestTimeoutMs}ms`;
        currentFailure ??= reason;
        reject(new Error(reason));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      try {
        send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  const notify = (method: string, params: unknown): void => {
    send({ jsonrpc: "2.0", method, params });
  };

  // RepoBoundary canonicalises the root with realpath, avoiding /var versus
  // /private/var URI mismatches on macOS (independent review I2).
  const rootUri = pathToFileURL(boundary.root).toString();
  const prefix = rootUri.endsWith("/") ? rootUri : `${rootUri}/`;
  const uriOf = (file: string): string =>
    pathToFileURL(boundary.resolve(file)).toString();

  try {
    const initialized = await request("initialize", {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: "sonde" }],
      capabilities: { textDocument: { definition: { linkSupport: false } } },
      initializationOptions: {},
    });
    if (initialized.error) {
      throw new Error(
        `pyright initialization failed: ${initialized.error.message ?? "unknown error"}`,
      );
    }
    notify("initialized", {});

    for (const file of files) {
      // Invariant 6: caller-controlled repository reads stay inside boundary.
      const text = boundary.readFile(file).toString("utf8");
      notify("textDocument/didOpen", {
        textDocument: {
          uri: uriOf(file),
          languageId: "python",
          version: 1,
          text,
        },
      });
    }
  } catch (error) {
    close();
    throw error;
  }

  const definitions = async (
    queries: DefinitionQuery[],
  ): Promise<DefinitionResult[]> => {
    const results: DefinitionResult[] = [];
    for (const query of queries) {
      if (closed) {
        currentFailure ??= "pyright session is closed";
        results.push({ kind: "none" });
        continue;
      }
      if (currentFailure) {
        results.push({ kind: "none" });
        continue;
      }

      let response: RpcResponse;
      try {
        response = await request("textDocument/definition", {
          textDocument: { uri: uriOf(query.file) },
          position: { line: query.line, character: query.character },
        });
      } catch (error) {
        currentFailure ??=
          error instanceof Error ? error.message : String(error);
        results.push({ kind: "none" });
        continue;
      }
      if (response.error) {
        currentFailure ??=
          `pyright definition request failed: ${response.error.message ?? "unknown error"}`;
        results.push({ kind: "none" });
        continue;
      }

      const location = firstLocation(response.result);
      const uri = location?.uri ?? location?.targetUri;
      const range =
        location?.range ??
        location?.targetSelectionRange ??
        location?.targetRange;
      const line = range?.start?.line;
      const character = range?.start?.character;
      if (
        !uri ||
        typeof line !== "number" ||
        typeof character !== "number"
      ) {
        results.push({ kind: "none" });
        continue;
      }

      if (!uri.startsWith(prefix)) {
        results.push({ kind: "external", uri });
        continue;
      }

      let targetPath: string;
      try {
        targetPath = fileURLToPath(uri);
      } catch {
        results.push({ kind: "external", uri });
        continue;
      }
      if (!boundary.contains(targetPath)) {
        results.push({ kind: "external", uri });
        continue;
      }
      const file = relative(boundary.root, boundary.resolve(targetPath))
        .split(sep)
        .join("/");
      results.push({ kind: "in-repo", file, line, character });
    }
    return results;
  };

  return {
    pyrightVersion,
    get failureReason() {
      return currentFailure;
    },
    definitions,
    close,
  };
}
