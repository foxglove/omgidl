module.exports = {
  preset: "ts-jest",
  moduleDirectories: ["../../node_modules", "./node_modules"],
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
    "\\.ne$": "<rootDir>/test/neTransformer.js",
  },
};
