import { DurableObject } from "cloudflare:workers";

interface Env {
  BACKEND: DurableObjectNamespace<Backend>;
  /** Shared secret for POST /admin/refresh. Set with `wrangler secret put ADMIN_TOKEN`. */
  ADMIN_TOKEN?: string;
  /**
   * Optional Slack/Discord-style incoming webhook. When set, a failed refresh
   * posts there. Without it a failure only reaches `wrangler tail`, which
   * nobody is watching at 06:00.
   */
  ALERT_WEBHOOK_URL?: string;
}

/** One container instance, addressed by a stable name. */
function backend(env: Env) {
  return env.BACKEND.get(env.BACKEND.idFromName("backend"));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return backend(env).fetch(request);
  },

  /**
   * Daily data refresh, driven by the cron trigger in wrangler.toml
   * (0 22 * * * UTC = 06:00 MYT).
   *
   * The Worker only kicks the container; the actual work lives in
   * scripts/daily_update.py behind POST /admin/refresh. waitUntil keeps the
   * invocation alive for the fetch, and errors are logged rather than thrown so
   * a dead upstream shows up in `wrangler tail` instead of as a failed cron.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        if (!env.ADMIN_TOKEN) {
          console.error("scheduled: ADMIN_TOKEN unset — refresh endpoint is disabled");
          return;
        }
        try {
          const res = await backend(env).fetch(
            new Request("http://backend/admin/refresh", {
              method: "POST",
              headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
            }),
          );
          const body = await res.text();
          console.log(`scheduled(${event.cron}) -> ${res.status} ${body.slice(0, 500)}`);

          // A 200 still carries a per-source report: one dead upstream is not a
          // job failure, but "status":"failed" means nothing refreshed or the
          // data left behind is unusable. Alert on that, and on a non-200.
          let failed = res.status !== 200;
          let summary = `HTTP ${res.status}`;
          try {
            const report = JSON.parse(body);
            failed = failed || report.status !== "ok";
            summary = `status=${report.status} ok=[${report.succeeded ?? []}] failed=[${report.failed ?? []}] validation_errors=${(report.validation?.errors ?? []).length}`;
          } catch { /* non-JSON body: the HTTP status is all we have */ }

          if (failed) await alert(env, `VoltPilot daily refresh failed — ${summary}`);
        } catch (err) {
          console.error(`scheduled(${event.cron}) failed:`, err);
          await alert(env, `VoltPilot daily refresh threw: ${err}`);
        }
      })(),
    );
  },
};

/** Post a one-line alert, if a webhook is configured. Never throws: a broken
 *  alerting path must not turn a partial refresh into a crashed cron. */
async function alert(env: Env, text: string): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL) {
    console.warn("ALERT_WEBHOOK_URL unset — failure not reported anywhere");
    return;
  }
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }), // Slack uses text, Discord content
    });
  } catch (err) {
    console.error("alert webhook failed:", err);
  }
}

export class Backend extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    // ctx.container is present because wrangler.toml binds this class to a
    // container image. start() is idempotent once the instance is running.
    const container = this.ctx.container!;
    if (!container.running) {
      container.start();
    }
    return container.getTcpPort(8080).fetch(request);
  }
}
