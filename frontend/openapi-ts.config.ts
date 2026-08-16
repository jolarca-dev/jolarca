import { defineConfig } from "@hey-api/openapi-ts";

// API client is GENERATED from the backend OpenAPI snapshot.
// Regenerate: `make api-schema` at repo root. Hand-edits fail CI.
export default defineConfig({
  input: "../docs/api/openapi.yaml",
  output: "src/lib/api/generated",
  plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
});
