import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "src/__mocks__/obsidian.ts"),
    },
  },
});
