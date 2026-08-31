/**
 * Bundle budget gate — walks .next/static, gzips every shipped JS/CSS
 * artifact, and flags chunks over the 150KB budget. CI-friendly exit
 * codes: 0 = within budget, 1 = violations. Run after `next build`:
 *
 *   npm run build && npm run analyze:bundle
 *
 * Budget rationale: 150KB gzipped per chunk keeps the critical path
 * under the LCP/INP budgets on simulated 4G (see lighthouse-budget.json).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const STATIC_DIR = join(process.cwd(), ".next", "static");
const BUDGET_BYTES = 150 * 1024;

interface Artifact {
  path: string;
  gzip: number;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(js|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  let files: string[];
  try {
    files = walk(STATIC_DIR);
  } catch {
    console.error("✗ No .next/static directory — run `npm run build` first.");
    process.exit(1);
  }

  const artifacts: Artifact[] = files
    .map((file) => ({
      path: relative(process.cwd(), file),
      gzip: gzipSync(readFileSync(file)).length,
    }))
    .sort((a, b) => b.gzip - a.gzip);

  const violations = artifacts.filter((a) => a.gzip > BUDGET_BYTES);
  const total = artifacts.reduce((sum, a) => sum + a.gzip, 0);

  console.log(`Analyzed ${artifacts.length} shipped artifacts (gzipped):`);
  for (const artifact of artifacts.slice(0, 10)) {
    const flag = artifact.gzip > BUDGET_BYTES ? "✗ OVER BUDGET" : "ok";
    console.log(
      `  ${flag.padEnd(14)} ${(artifact.gzip / 1024).toFixed(1).padStart(8)}KB  ${artifact.path}`,
    );
  }
  console.log(`Total gzipped: ${(total / 1024).toFixed(1)}KB`);

  if (violations.length > 0) {
    console.error(
      `\n✗ ${violations.length} artifact(s) exceed the 150KB chunk budget.`,
    );
    process.exit(1);
  }
  console.log("\n✓ All chunks within the 150KB budget.");
}

main();
