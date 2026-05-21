/**
 * OpenAPI coverage checks.
 *
 * Two layers:
 *   1. Targeted enforcement on the files this task migrated to the registry
 *      (integration services + RFI/submittal routes). Every direct
 *      `app.<method>("/api/...")` call must be represented in the OpenAPI
 *      registry after `registerIntegrationRouteDocs()` runs. Adding a new
 *      undocumented route in these files breaks the build.
 *
 *   2. Global non-regression guard for the rest of the codebase. We scan
 *      every `server/routes/**` and `server/services/**` file for raw
 *      `app.<method>("/api/...")` declarations and assert the count does not
 *      exceed a known baseline. New undocumented routes anywhere in the
 *      codebase therefore fail CI. When you document one of the existing
 *      undocumented routes (good!) lower the baseline.
 *
 * The runtime equivalent of this check lives in `server/swagger.ts` — set
 * `OPENAPI_STRICT=1` to make boot fail when undocumented routes exist.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { getRegisteredPaths } from "../server/route-registry";
import { registerIntegrationRouteDocs } from "../server/routes/integrationRouteDocs";

const TARGETED_FILES = [
  "server/services/microsoftPlanner.ts",
  "server/services/projectOnline.ts",
  "server/services/dynamics365Sales.ts",
  "server/services/microsoftDataverse.ts",
  "server/routes/rfiRoutes.ts",
  "server/routes/submittalRoutes.ts",
];

const SCAN_DIRS = ["server/routes", "server/services"];
const ROUTE_REGEX = /\bapp\.(get|post|put|patch|delete)\(\s*["'`](\/api\/[^"'`]+)["'`]/g;

/**
 * Cap for the total number of raw `app.<method>("/api/...")` calls allowed
 * across `server/routes` and `server/services`. This is the count snapshotted
 * at task #11 — currently 271. Lower it when you migrate a route. Raising it
 * (adding more undocumented routes) is not allowed.
 */
const RAW_ROUTE_BASELINE = 271;

function expressPathToOpenApiPath(p: string): string {
  return p.replace(/^\/api/, "").replace(/:(\w+)/g, "{$1}");
}

function findRoutesIn(files: string[]) {
  const out: Array<{ file: string; method: string; path: string }> = [];
  for (const rel of files) {
    const abs = join(process.cwd(), rel);
    const src = readFileSync(abs, "utf8");
    for (const m of src.matchAll(ROUTE_REGEX)) {
      out.push({ file: rel, method: m[1].toLowerCase(), path: m[2] });
    }
  }
  return out;
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  const abs = join(process.cwd(), dir);
  const stack = [abs];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const p = join(cur, entry);
      const s = statSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (s.isFile() && /\.(ts|tsx)$/.test(entry)) out.push(relative(process.cwd(), p));
    }
  }
  return out;
}

describe("OpenAPI coverage", () => {
  beforeAll(() => {
    registerIntegrationRouteDocs();
  });

  it("documents every direct app.<method>() call in the migrated integration / RFI / submittal files", () => {
    const raw = findRoutesIn(TARGETED_FILES);
    expect(raw.length).toBeGreaterThan(0);

    const documented = getRegisteredPaths();
    const missing: string[] = [];
    for (const r of raw) {
      const oaPath = expressPathToOpenApiPath(r.path);
      const entry = documented[oaPath];
      if (!entry || !entry[r.method]) {
        missing.push(`${r.method.toUpperCase()} ${r.path}  (${r.file})`);
      }
    }
    expect(missing, `Undocumented routes:\n  - ${missing.join("\n  - ")}`).toEqual([]);
  });

  it("registerIntegrationRouteDocs() registers all expected integration paths", () => {
    registerIntegrationRouteDocs();
    const paths = getRegisteredPaths();
    expect(paths["/planner/status"]?.get).toBeDefined();
    expect(paths["/project-online/projects"]?.get).toBeDefined();
    expect(paths["/dynamics365/invoices/{invoiceId}"]?.get).toBeDefined();
    expect(paths["/dataverse/plans/{planId}/tasks"]?.get).toBeDefined();
    expect(paths["/projects/{projectId}/rfis/{rfiId}/responses"]?.post).toBeDefined();
    expect(paths["/projects/{projectId}/submittals/{submittalId}/revisions/{revisionId}/review"]?.patch).toBeDefined();
  });

  it("does not grow the population of undocumented direct app.<method>() routes anywhere in server/routes or server/services", () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) files.push(...walkTsFiles(dir));
    const raw = findRoutesIn(files);

    expect(raw.length).toBeLessThanOrEqual(
      RAW_ROUTE_BASELINE,
      `Raw app.<method>("/api/...") count grew from baseline ${RAW_ROUTE_BASELINE} to ${raw.length}. ` +
      `Register the new route(s) via apiRoute() or server/routes/integrationRouteDocs.ts. ` +
      `If you intentionally migrated a route into the registry, lower RAW_ROUTE_BASELINE in this test.`,
    );
  });
});
