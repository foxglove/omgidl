// @ts-check

const foxglove = require("@foxglove/eslint-plugin");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["**/dist"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
  ...foxglove.configs.base,
  ...foxglove.configs.jest,
  ...foxglove.configs.typescript.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    rules: {
      "@foxglove/prefer-hash-private": "off", // may require a version bump when enabling & fixing this
    },
  },
);
