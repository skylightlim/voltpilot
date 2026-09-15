/* Warm every route the suite visits before any worker starts.
 *
 * The webServer is `next dev`, which compiles a route on its first request.
 * With fullyParallel workers, several tests land on an uncompiled route at
 * once and queue behind the same compile; the slowest then blows its 30s test
 * timeout. It surfaced as one unrelated test ("a rate-limited reply keeps the
 * figure already on screen") failing roughly one run in three once the suite
 * grew past ~20 tests, and passing every time in isolation — the shape of a
 * contention flake, not a product bug.
 *
 * Compiling them serially here costs a few seconds once and takes the race out
 * of the suite entirely.
 */
import type { FullConfig } from "@playwright/test";

const ROUTES = ["/", "/calculators", "/sliders", "/intake/1", "/intake/4"];

export default async function globalSetup(config: FullConfig) {
  const base =
    (config.projects[0]?.use?.baseURL as string | undefined) ?? "http://127.0.0.1:3100";
  for (const route of ROUTES) {
    try {
      await fetch(new URL(route, base), { signal: AbortSignal.timeout(90_000) });
    } catch {
      // A route that will not compile is the tests' problem to report, with a
      // real assertion and a real message — not this file's to guess at.
    }
  }
}
