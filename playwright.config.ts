import { defineConfig, devices } from "@playwright/test";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dataFile = join(mkdtempSync(join(tmpdir(), "dockit-e2e-")), "portal.json");
copyFileSync(join(root, "e2e/fixtures/portal.json"), dataFile);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `PORTAL_DATA_FILE=${JSON.stringify(dataFile)} npx vite dev --host 127.0.0.1 --port 4173 --strictPort`,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORTAL_DATA_FILE: dataFile,
    },
  },
});
