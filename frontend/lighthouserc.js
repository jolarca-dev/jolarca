/**
 * Lighthouse CI budgets — CWV targets from the frontend ADR-0009 posture
 * (internal budgets ~20% tighter than the "Good" thresholds).
 * Runs in CI against the production build (npm run start).
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 60000,
      url: [
        "http://localhost:3000/en",
        "http://localhost:3000/en/funeral-services",
        "http://localhost:3000/lt",
      ],
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--no-sandbox --headless=new",
        // Emulated mobile is LHCI's default; keep it — our persona floor is
        // a 50+ user on modest hardware.
        throttlingMethod: "simulate",
        // Resource + timing budgets (Lighthouse budget format). Breaches
        // show up in the report alongside the assertion failures below.
        budgetPath: "./scripts/lighthouse-budget.json",
      },
    },
    assert: {
      assertions: {
        // Hard budgets: fail the pipeline with actionable output.
        "largest-contentful-paint": ["error", { maxNumericValue: 2000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
        "speed-index": ["error", { maxNumericValue: 3000 }],
        // Regression alarm (warn, don't block).
        "first-contentful-paint": ["warn", { maxNumericValue: 1800 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
      reportFilename: "lighthouse-report",
    },
  },
};
