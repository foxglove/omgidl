import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    maxWorkers: 2,
    projects: ["packages/*/vitest.config.mjs"],
  },
});
