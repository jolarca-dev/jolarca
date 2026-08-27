/**
 * API contract drift gate — CI runs this as the final frontend gate.
 *
 * Regenerates types from the OpenAPI snapshot in a temp file and compares
 * against the committed src/generated/api.ts. Any diff fails with exit 1
 * and prints a unified diff plus the exact fix command.
 *
 * Usage: npm run api:drift
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateApiTypes, OUTPUT_FILE } from "./generate-api-client";

async function main(): Promise<void> {
  if (!existsSync(OUTPUT_FILE)) {
    console.error(
      `::error::${OUTPUT_FILE} is missing — run 'npm run generate:api' and commit the result.`,
    );
    process.exit(1);
  }

  const fresh = await generateApiTypes();
  const committed = readFileSync(OUTPUT_FILE, "utf8");

  if (fresh === committed) {
    console.log("✓ API types are in sync with the OpenAPI snapshot.");
    return;
  }

  const tmp = mkdtempSync(path.join(os.tmpdir(), "api-drift-"));
  const committedPath = path.join(tmp, "committed.api.ts");
  const freshPath = path.join(tmp, "regenerated.api.ts");
  writeFileSync(committedPath, committed, "utf8");
  writeFileSync(freshPath, fresh, "utf8");

  console.error(
    "::error::API client drift detected — src/generated/api.ts is stale. Run 'npm run generate:api' and commit the result.",
  );
  try {
    execFileSync("diff", ["--unified=3", committedPath, freshPath], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch {
    // diff exits 1 when files differ — the diff itself is already printed.
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("::error::API drift check failed:", err);
  process.exit(1);
});
