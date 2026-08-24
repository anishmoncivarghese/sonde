import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { confirm } from "../../src/cli/prompt.js";

function fakeInput(text: string): PassThrough {
  const stream = new PassThrough();
  stream.end(text);
  return stream;
}

describe("confirm", () => {
  it("returns true for 'y'", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("y\n"), output)).toBe(true);
  });

  it("returns true for 'yes', case-insensitively", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("Yes\n"), output)).toBe(true);
  });

  it("returns false for 'n'", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("n\n"), output)).toBe(false);
  });

  it("returns false for anything else typed", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("sure whatever\n"), output)).toBe(
      false,
    );
  });

  it("returns false on empty input (EOF, non-interactive shell)", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput(""), output)).toBe(false);
  });

  it("writes the question to the output stream", async () => {
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => {
      written += chunk.toString();
    });
    await confirm("Write this to .mcp.json?", fakeInput("y\n"), output);
    expect(written).toContain("Write this to .mcp.json?");
  });
});
