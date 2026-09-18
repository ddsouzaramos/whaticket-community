module.exports = {
  rootDir: ".",
  clearMocks: true,
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/**/*.spec.js"],
  moduleDirectories: ["node_modules", "../backend/node_modules"],
  setupFilesAfterEnv: ["@testing-library/jest-dom/extend-expect"],
  transform: {
    "^.+\\.jsx?$": "<rootDir>/../backend/node_modules/ts-jest",
  },
  globals: {
    "ts-jest": {
      diagnostics: false,
      tsconfig: {
        allowJs: true,
        esModuleInterop: true,
        jsx: "react",
        module: "commonjs",
        target: "es2017",
      },
    },
  },
};
