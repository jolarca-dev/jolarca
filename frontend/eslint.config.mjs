import path from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      ".next.bak*/**",
      ".lighthouseci/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      // CI artifact — lint the generator scripts, not the output.
      "src/generated/**",
      "scripts/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // CJS config files legitimately use require().
    files: ["next.config.js", "lighthouserc.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // Compliance floor: no secrets, no tracking without consent hooks.
      // Production logging goes through src/lib/logger.ts ONLY — console
      // statements are a PII-leak vector, hence error severity. The one
      // sanctioned exception (dev pretty-print) carries an inline disable.
      "no-console": "error",
    },
  },
  {
    // CLI scripts and test suites may print/assert on console output.
    files: ["scripts/**/*.ts", "tests/**/*", "e2e/**/*"],
    rules: {
      "no-console": "off",
    },
  },
];

export default config;
