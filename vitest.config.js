import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    globals: true,
    environment: "jsdom",
    coverage: {
      provider: "v8",
      thresholds: { 100: true, perFile: true },
      include: ["src/**/*.js", "engine.js", "constants.js", "landing.js", "main.js", "state.js", "ui.js"],
      reporter: ["text", "html", "lcov", "json-summary"],
    },
  },
});
