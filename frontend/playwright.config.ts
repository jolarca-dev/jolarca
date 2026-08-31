import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration — runs against the Docker Compose stack
 * (`make e2e-up` + seed). Base URL via PLAYWRIGHT_BASE_URL (E2E_BASE_URL
 * kept as the legacy fallback). Selectors target the `/en` locale so
 * assertions never depend on Lithuanian UI strings.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // No hardcoded waits anywhere; generous timeouts cover cold-stack starts.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Parallelism: 4 workers locally, 2 in CI (modest runners).
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["json", { outputFile: "playwright-report/results.json" }],
      ],
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      process.env.E2E_BASE_URL ??
      "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // On-VM production verification: the VM cannot reach its own public IP
    // (NAT hairpin) and pre-issuance TLS is the bootstrap cert. Opt in via
    // PLAYWRIGHT_HOST_RULES (chromium DNS override, e.g.
    // "MAP marketplace.gyvenimo-kelias.lt 127.0.0.1") and
    // PLAYWRIGHT_INSECURE=1 (accept the self-signed bootstrap chain).
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_INSECURE === "1",
    ...(process.env.PLAYWRIGHT_HOST_RULES
      ? {
          launchOptions: {
            args: [
              `--host-resolver-rules=${process.env.PLAYWRIGHT_HOST_RULES}`,
            ],
          },
        }
      : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
});
