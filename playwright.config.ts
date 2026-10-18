import { defineConfig, devices } from "@playwright/test";

// E2E memakai data DEMO deterministik pada server terpisah (port 3100,
// DATA_MODE=demo) agar tidak bergantung pada data pasar real yang berubah
// setiap hari, dan tidak bentrok dengan server pengembangan di port 3000.
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 90_000,
        env: { DATA_MODE: "demo" },
      },
});
