module.exports = {
  preset: "ts-jest",
  moduleDirectories: ["../../node_modules", "./node_modules"],
  setupFilesAfterEnv: ["@sounisi5011/jest-binary-data-matchers"],
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
};
