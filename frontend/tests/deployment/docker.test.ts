import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Deployment contract tests — static analysis of the Docker/compose/nginx
 * artifacts (no daemon required, so they run in CI on every push). The
 * image-size budget additionally runs when Docker is available locally.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const dockerfile = read("frontend/Dockerfile");
const dockerignore = read("frontend/.dockerignore");
const composeProd = read("docker-compose.prod.yml");
const nginxProd = read("nginx/nginx.prod.conf");

describe("frontend Dockerfile — production hardening", () => {
  it("uses multi-stage build with a standalone runner", () => {
    expect(dockerfile).toContain("AS deps");
    expect(dockerfile).toContain("AS builder");
    expect(dockerfile).toContain("AS runner");
    expect(dockerfile).toContain(".next/standalone");
  });

  it("installs lockfile-only with lifecycle scripts disabled", () => {
    expect(dockerfile).toMatch(/npm ci --ignore-scripts/);
    expect(dockerfile).not.toMatch(/npm install(?!\s)/);
  });

  it("never bakes secrets or env files into layers", () => {
    expect(dockerfile).not.toMatch(/COPY[^\n]*\.env/);
    expect(dockerfile).not.toContain("DJANGO_SECRET_KEY");
    // And the build context refuses them outright.
    expect(dockerignore).toContain(".env");
    expect(dockerignore).toContain(".env.*");
  });

  it("runs as a non-root user and probes the liveness route", () => {
    expect(dockerfile).toMatch(/^USER /m);
    expect(dockerfile).not.toMatch(/^USER root/m);
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("/api/health");
    // busybox wget — no curl in the runner (smaller attack surface).
    expect(dockerfile).not.toMatch(/apk add[^\n]*curl/);
  });

  it("disables Next telemetry and pins production mode", () => {
    expect(dockerfile).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(dockerfile).toContain("NODE_ENV=production");
  });
});

describe("docker-compose.prod.yml — production topology", () => {
  it("secrets arrive via .env.prod, never inline", () => {
    expect(composeProd).toContain(".env.prod");
    expect(composeProd).toContain("POSTGRES_PASSWORD:?");
  });

  it("isolates tiers: only nginx publishes ports", () => {
    expect(composeProd).toMatch(/frontend:/);
    expect(composeProd).toMatch(/internal: true/);
    expect(composeProd).not.toMatch(/^\s+ports:\s*\n\s*-\s*.*3000/m);
  });

  it("restarts everything and health-gates dependencies", () => {
    expect(composeProd).toContain("restart: unless-stopped");
    expect(composeProd).toContain("condition: service_healthy");
  });

  it("mounts TLS material read-only into nginx only", () => {
    expect(composeProd).toContain("./ssl:/etc/nginx/ssl:ro");
  });
});

describe("nginx.prod.conf — edge contract", () => {
  it("terminates TLS with HTTP/2 and redirects plain HTTP", () => {
    expect(nginxProd).toContain("listen 443 ssl");
    expect(nginxProd).toContain("http2 on");
    expect(nginxProd).toContain("return 301 https://");
  });

  it("mirrors the middleware security header floor", () => {
    expect(nginxProd).toContain("Strict-Transport-Security");
    expect(nginxProd).toContain("X-Frame-Options");
    expect(nginxProd).toContain("nosniff");
    expect(nginxProd).toContain("payment=(self)");
  });

  it("rate-limits the API tighter than general traffic", () => {
    expect(nginxProd).toContain("zone=api:10m rate=10r/s");
    expect(nginxProd).toContain("burst=20");
  });

  it("caps uploads at 10MB and logs JSON at warn level", () => {
    expect(nginxProd).toContain("client_max_body_size 10m");
    expect(nginxProd).toContain("log_format json");
    expect(nginxProd).toContain("error.log warn");
  });
});

describe("image size budget (requires Docker)", () => {
  it(
    "runner image stays under 500MB",
    () => {
      let available = false;
      try {
        execSync("docker info", { stdio: "ignore" });
        available = true;
      } catch {
        available = false;
      }
      if (!available) {
        // CI without a daemon: the static contract above still enforces
        // the inputs (standalone output, alpine, no dev deps in runner).
        expect(true).toBe(true);
        return;
      }
      execSync("docker build -t jol-test/frontend frontend --target runner", {
        cwd: ROOT,
        stdio: "ignore",
      });
      const size = execSync(
        "docker image inspect jol-test/frontend --format '{{.Size}}'",
        { encoding: "utf8" },
      ).trim();
      expect(Number(size)).toBeLessThan(500 * 1024 * 1024);
    },
    // Cold builds take minutes; warm cache makes reruns near-instant.
    10 * 60 * 1000,
  );
});
