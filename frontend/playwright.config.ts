import { defineConfig, devices } from "@playwright/test";

/* Browser smoke tests. issue.md issue 21.
 *
 * The node --test suite in tests/ reads source files and asserts about their
 * text. It cannot see a page that renders and then does nothing, which is how
 * a blank calculators page reached a user on 2026-09-14: backend tests green,
 * TypeScript clean, production build fine, every endpoint answering 200.
 *
 * Backend responses are intercepted rather than served, so this needs no
 * FastAPI process and no database. That is also what makes it precise: the
 * failure being guarded against is the page never calling the API, or calling
 * it and rendering nothing, and both are visible without a real backend.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Port 3100 AND its own dist dir. next.config.ts reads NEXT_DIST_DIR for
    // exactly this reason: two Next processes sharing .next fight over it and
    // leave the other serving 500s from a half-written manifest.
    command: "npx next dev -p 3100",
    env: { NEXT_DIST_DIR: ".next-e2e", BACKEND_URL: "http://127.0.0.1:8000" },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
