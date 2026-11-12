/** Send a named event to PostHog. A no-op until PostHog has started (dev, tests,
 *  or a blocked script), so callers never need to check. The type of
 *  window.posthog is declared in components/Analytics.tsx. */
export function track(event: string, props?: Record<string, string | number | boolean>) {
  try {
    const ph = typeof window === "undefined" ? undefined : window.posthog;
    if (ph?.__loaded) ph.capture(event, props);
  } catch {
    /* analytics must never break the page */
  }
}
