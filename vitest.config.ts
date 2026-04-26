import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/__tests__/setup.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts", "src/store/**/*.ts"],
    },
  },
});
