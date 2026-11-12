"use client";

import { useEffect } from "react";

/* PostHog project key. Public by design (it only lets a browser send events), so
   it is safe in the bundle; NEXT_PUBLIC_POSTHOG_KEY overrides it. */
const KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_BvGCJCcpiWD9Fd5DDZLjWcWhDzym9naz2Q29GSVihkDu";

/* Counts visits, page views and clicks. It never records what people type:
   autocapture sends the clicked element, not input values, and session replay
   is left off. Local dev and tests send nothing.

   PostHog's script is loaded at runtime from our own /ingest proxy (see
   next.config.ts) rather than bundled: the posthog-js package pushed the
   recommendation page's Edge Function past Vercel's 1 MB limit, and the proxy
   also keeps ad blockers from dropping it. */
export function Analytics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !KEY || window.posthog) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = "/ingest/static/array.js";
    s.onload = () =>
      window.posthog?.init(KEY, {
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: "history_change",
        autocapture: true,
        disable_session_recording: true,
      });
    document.head.appendChild(s);
  }, []);
  return null;
}

declare global {
  interface Window {
    posthog?: {
      __loaded?: boolean;
      init: (key: string, options: Record<string, unknown>) => void;
      capture: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}
