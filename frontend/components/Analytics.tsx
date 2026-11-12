"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/* PostHog project key. Public by design (it only lets a browser send events), so
   it is safe in the bundle; NEXT_PUBLIC_POSTHOG_KEY overrides it. */
const KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_BvGCJCcpiWD9Fd5DDZLjWcWhDzym9naz2Q29GSVihkDu";

/* Counts visits, page views and clicks. It never records what people type:
   autocapture sends the clicked element, not input values, and session replay
   is left off. Local dev and tests send nothing. Events go through /ingest on
   our own domain (see next.config.ts) so ad blockers do not drop them. */
export function Analytics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !KEY || posthog.__loaded) return;
    posthog.init(KEY, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      autocapture: true,
      disable_session_recording: true,
    });
  }, []);
  return null;
}
