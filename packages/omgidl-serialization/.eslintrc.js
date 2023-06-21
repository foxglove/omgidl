module.exports = {
  root: true,
  extends: ["plugin:@foxglove/base", "plugin:@foxglove/jest"],
  env: { es2020: true },
  ignorePatterns: ["dist"],
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      extends: ["plugin:@foxglove/typescript"],
      parserOptions: { project: "tsconfig.json", tsconfigRootDir: __dirname },
    },
  ],
};
