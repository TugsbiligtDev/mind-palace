// Unit tests (`pnpm test`): components render in jsdom, a simulated browser.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // shell-panel-load.test.tsx pins a known bug: a failing "Check my work" throws an error nobody
    // catches. Only that test's error is ignored; any other uncaught error still fails the run.
    onUnhandledError: (error) => {
      const cause = (error as Error).cause as Error | undefined;
      if (`${error.message} ${cause?.message}`.includes("pinned: checker download failed")) return false;
    },
  },
});
