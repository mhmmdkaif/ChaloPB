export default {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.js"],
  transform: {
    "^.+\\.js$": [
      "babel-jest",
      {
        presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      },
    ],
  },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.js"],
  collectCoverage: false,
  collectCoverageFrom: [
    "src/services/gpsService.js",
    "src/services/etaService.js",
    "src/controllers/driverController.js",
  ],
};
