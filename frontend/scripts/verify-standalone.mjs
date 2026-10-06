/**
 * Standalone production-server verification. Mirrors the Docker runner
 * stage on the host: copies static assets into .next/standalone (as the
 * Dockerfile does), boots server.js on a scratch port, then asserts the
 * SERVED page + CSS contain real Tailwind output (utilities, --tw- vars)
 * and that the HTML carries utility classes. Run from frontend/ after
 * `npm run build`:
 *   node scripts/verify-standalone.mjs
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PORT = process.env.VERIFY_PORT ?? "3100";
const BASE = `http://127.0.0.1:${PORT}`;
const standalone = path.join(process.cwd(), ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error(
    "FAIL: .next/standalone/server.js missing — run npm run build first.",
  );
  process.exit(1);
}

// Runner-stage asset wiring (same copies the Dockerfile performs).
cpSync(".next/static", path.join(standalone, ".next", "static"), {
  recursive: true,
});
if (existsSync("public")) {
  cpSync("public", path.join(standalone, "public"), { recursive: true });
}

const server = spawn("node", ["server.js"], {
  cwd: standalone,
  env: { ...process.env, PORT, HOSTNAME: "127.0.0.1" },
  stdio: "ignore",
});

const waitFor = async (url, ms = 20000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};

let exitCode = 1;
try {
  if (!(await waitFor(`${BASE}/api/health`))) {
    console.error("FAIL: standalone server did not become healthy.");
    process.exit(1);
  }

  const html = await (await fetch(`${BASE}/en/`)).text();

  // Assert the contract, not one major's file layout. Next 15 served
  // /_next/static/css/*.css and Next 16 moved it to /_next/static/chunks/*.css, so a
  // hard-coded path turns a white-screen guard into a layout assertion that fails
  // closed the next time upstream relocates an asset. Attributes are parsed
  // order-independently because Next emits rel before href today, and need not.
  const cssHrefs = [...html.matchAll(/<link\b[^>]*>/g)]
    .filter((m) => /rel="stylesheet"/.test(m[0]))
    .map((m) => m[0].match(/href="([^"]+)"/)?.[1])
    .filter(Boolean);

  if (cssHrefs.length === 0) {
    console.error("FAIL: no stylesheet <link> in standalone-served HTML.");
    process.exit(1);
  }

  const sheets = [];
  for (const href of cssHrefs) {
    const res = await fetch(BASE + href);
    const type = res.headers.get("content-type") ?? "";
    const body = res.ok ? await res.text() : "";
    console.log(
      `CSS file: ${href} — ${body.length} bytes, ${type || "no content-type"}, HTTP ${res.status}`,
    );
    if (!res.ok || !type.includes("text/css") || body.length < 1000) {
      console.error(`FAIL: stylesheet ${href} is not served as real CSS.`);
      process.exit(1);
    }
    sheets.push(body);
  }
  const css = sheets.join("\n");

  const utilities = [".flex", ".grid", ".max-w-"].some((s) => css.includes(s));
  const twVars = css.includes("--tw-");
  const rawApply = css.includes("@apply");
  const htmlClasses = (html.match(/class="[^"]*"/g) ?? [])
    .slice(0, 12)
    .join("\n");

  console.log(
    `Stylesheets served: ${sheets.length} (${css.length} bytes total)`,
  );
  console.log(`Utility selectors present: ${utilities ? "YES" : "NO"}`);
  console.log(`--tw- variables present: ${twVars ? "YES" : "NO"}`);
  console.log(`Raw @apply leaked: ${rawApply ? "YES (BAD)" : "no"}`);
  console.log("Sample HTML classes:\n" + htmlClasses);

  const htmlHasUtilities = /class="[^"]*(flex|grid|max-w-|bg-|text-)/.test(
    html,
  );
  console.log(
    `HTML carries utility classes: ${htmlHasUtilities ? "YES" : "NO"}`,
  );

  const pass = utilities && twVars && !rawApply && htmlHasUtilities;
  console.log(
    pass ? "STANDALONE VERIFICATION: PASS" : "STANDALONE VERIFICATION: FAIL",
  );
  exitCode = pass ? 0 : 1;
} finally {
  server.kill();
}
process.exit(exitCode);
