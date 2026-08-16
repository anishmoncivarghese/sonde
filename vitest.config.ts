import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Oracle fixture repos contain real .test.ts files that are INPUT DATA for
    // the tsc oracle (Task 11), not tests of this project. Without this exclude
    // vitest collects and runs them, and they fail.
    exclude: ["**/node_modules/**", "tests/fixtures/**"],
  },
});
