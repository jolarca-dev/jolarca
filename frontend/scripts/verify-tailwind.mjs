/**
 * Verifies the production build artifact contains generated Tailwind v4
 * output (utility selectors + --tw- runtime variables). Guards against the
 * failure mode where @tailwindcss/postcss is unregistered and Next ships
 * theme/preflight-only CSS with raw @apply. Run from frontend/:
 *   node scripts/verify-tailwind.mjs   (after npm run build)
 */
import fs from "node:fs";
import path from "node:path";

const cssDir = path.join(process.cwd(), ".next", "static", "css");
const files = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css"));

let foundUtilities = false;
let foundTwVars = false;

for (const file of files) {
  const content = fs.readFileSync(path.join(cssDir, file), "utf-8");

  if (
    content.includes(".flex") ||
    content.includes(".grid") ||
    content.includes(".max-w-")
  ) {
    foundUtilities = true;
  }
  if (content.includes("--tw-")) {
    foundTwVars = true;
  }

  console.log(`File: ${file}, Size: ${content.length} bytes`);
  console.log(`Sample: ${content.slice(0, 200)}...`);
}

console.log(`\nUtility selectors present: ${foundUtilities ? " YES" : " NO"}`);
console.log(`--tw- variables present: ${foundTwVars ? " YES" : " NO"}`);

if (!foundUtilities || !foundTwVars) {
  console.error("Build artifact is still gutted.");
  process.exit(1);
}
