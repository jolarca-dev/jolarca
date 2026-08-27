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
  const cssHref = html.match(/\/_next\/static\/css\/[^"]+\.css/)?.[0];
  if (!cssHref) {
    console.error("FAIL: no CSS link in standalone-served HTML.");
    process.exit(1);
  }
  const css = await (await fetch(BASE + cssHref)).text();

  const utilities = [".flex", ".grid", ".max-w-"].some((s) => css.includes(s));
  const twVars = css.includes("--tw-");
  const rawApply = css.includes("@apply");
  const htmlClasses = (html.match(/class="[^"]*"/g) ?? [])
    .slice(0, 12)
    .join("\n");

  console.log(`CSS file: ${cssHref} — ${css.length} bytes (minified prod)`);
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
