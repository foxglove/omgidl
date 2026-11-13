import { defineProject } from "vitest/config";

export default defineProject({
  root: import.meta.dirname,
  test: {
    name: "ros2idl-parser",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
