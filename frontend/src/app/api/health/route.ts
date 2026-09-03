/**
 * Liveness probe — consumed by the Docker HEALTHCHECK (wget, no curl in
 * the runner image) and the deploy script's traffic gate. Deliberately
 * trivial: static 200 JSON, no data access, no-store caching. The
 * middleware matcher skips /api, so no nonce/CSP overhead applies.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", service: "jolarca-frontend" },
    {
      headers: {
        "Cache-Control": "no-store",
        // Never cache probes at intermediate layers.
      },
    },
  );
}
