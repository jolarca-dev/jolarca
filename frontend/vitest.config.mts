import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The project tsconfig uses jsx: "preserve" (Next.js owns the JSX
  // pipeline); the React plugin compiles JSX for .tsx tests AND the
  // src/*.tsx components they import — React 19 automatic runtime.
  plugins: [react()],
  test: {
    environment: "node",
    // next-intl's ESM build imports the extensionless "next/navigation";
    // inlining it lets the alias below route that through Vite's resolver
    // (externalized deps bypass aliases via native Node resolution).
    server: {
      deps: {
        inline: ["next-intl"],
      },
    },
    // .tsx covers the jsdom-based a11y component tests (per-file
    // environment via `// @vitest-environment jsdom`).
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/security/**/*.test.ts",
      "tests/performance/**/*.test.{ts,tsx}",
      "tests/lib/**/*.test.ts",
      "tests/components/**/*.test.tsx",
      "tests/deployment/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Scaffold stage: thresholds apply to the modules under test today.
      // Widen `include` as app logic lands; never lower the 80% floor.
      include: [
        "src/lib/api/contract-gaps.ts",
        "src/styles/theme.ts",
        "src/i18n/config.ts",
        "src/lib/security.ts",
        "src/lib/password-strength.ts",
        "src/lib/checkout.ts",
        "src/stores/cart-store.ts",
        "src/stores/consent-store.ts",
        "src/lib/seller.ts",
        "src/lib/admin.ts",
        "src/lib/funeral.ts",
        "src/lib/search.ts",
        "src/lib/errors.ts",
        "src/lib/logger.ts",
        "src/lib/a11y.ts",
        "src/lib/validation.ts",
        "src/lib/sanitization.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // next-intl's ESM build imports the extensionless "next/navigation";
      // Node ESM resolution needs the explicit .js target under Vitest.
      "next/navigation": path.resolve(
        __dirname,
        "node_modules/next/navigation.js",
      ),
    },
  },
});
