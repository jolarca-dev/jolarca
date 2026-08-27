/**
 * Generates src/generated/api.ts (types only) from the backend OpenAPI
 * snapshot using openapi-typescript. The runtime client is openapi-fetch
 * (src/lib/api-client.ts) + TanStack Query hooks (src/hooks/use-api.ts).
 *
 * Schema resolution order (first existing wins):
 *   1. $OPENAPI_SCHEMA                          (explicit override)
 *   2. ../backend/openapi.yaml                  (backend-owned export)
 *   3. ../docs/api/openapi.yaml                 (CI snapshot, `make api-schema`)
 *
 * Usage: npm run generate:api   (repo root: `make api-schema`)
 *
 * The output file is COMMITTED — CI's drift gate (scripts/check-api-drift.ts)
 * fails any PR where it is stale.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");
export const OUTPUT_FILE = path.join(
  FRONTEND_ROOT,
  "src",
  "generated",
  "api.ts",
);

const BANNER = `/* eslint-disable */
/**
 * AUTO-GENERATED from the backend OpenAPI snapshot — DO NOT EDIT.
 * Regenerate: npm run generate:api (repo root: make api-schema)
 * Drift gate: npm run api:drift (runs in CI)
 * Source tool: openapi-typescript (types only; runtime = openapi-fetch).
 */
`;

export function resolveSchemaPath(): string {
  const candidates = [
    process.env.OPENAPI_SCHEMA,
    path.join(REPO_ROOT, "backend", "openapi.yaml"),
    path.join(REPO_ROOT, "docs", "api", "openapi.yaml"),
  ].filter((p): p is string => Boolean(p));

  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error("::error::No OpenAPI schema found. Tried:");
    for (const c of candidates) console.error(`  - ${c}`);
    console.error(
      "Generate the snapshot first: cd backend && python manage.py spectacular --file ../docs/api/openapi.yaml --validate",
    );
    process.exit(1);
  }
  return found;
}

/** Pure generation — used by the drift checker against a committed copy. */
export async function generateApiTypes(schemaPath?: string): Promise<string> {
  const schema = schemaPath ?? resolveSchemaPath();
  // openapi-typescript v8 requires a URL for local files.
  const ast = await openapiTS(pathToFileURL(schema));
  return BANNER + astToString(ast);
}

async function main(): Promise<void> {
  const schema = resolveSchemaPath();
  const contents = await generateApiTypes(schema);
  mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, contents, "utf8");
  console.log(
    `✓ Generated ${path.relative(REPO_ROOT, OUTPUT_FILE)} from ${path.relative(REPO_ROOT, schema)}`,
  );
}

// Run only when executed directly (not when imported by the drift checker).
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error("::error::API type generation failed:", err);
    process.exit(1);
  });
}
