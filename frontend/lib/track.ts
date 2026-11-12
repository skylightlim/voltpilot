import posthog from "posthog-js";

/** Send a named event to PostHog. A no-op until PostHog has started (dev, tests,
 *  or a blocked script), so callers never need to check. */
export function track(event: string, props?: Record<string, string | number | boolean>) {
  try {
    if (posthog.__loaded) posthog.capture(event, props);
  } catch {
    /* analytics must never break the page */
  }
}
