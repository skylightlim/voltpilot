/**
 * Ephemeral credential for the Gemini Live session.
 *
 * This used to be POST /tokens/live on the FastAPI backend. That endpoint reads
 * four values out of config and returns them — no database, no computation — but
 * on Vercel it drags the whole Python function (scipy, pandas, numpy, reportlab)
 * into memory to do it. Measured on the deployed backend: 8.93s cold, 0.30s warm.
 * It sits on the session-start path, so every voice interview begun against a
 * cold function waited ~9s before the WebSocket could even open.
 *
 * Until 2026-09-27 both versions returned GEMINI_API_KEYS[0] itself, so any
 * visitor could lift the key from the network tab and use it on every Gemini
 * endpoint. The browser now gets a Live-only token that opens one session, must
 * do so within a minute, and expires after 30. Verified against the live API:
 * a second session on the same token closes with 1011 "Token has been used too
 * many times", and generateContent rejects it outright.
 *
 * Only `model` is locked, via fieldMask. A token that carries
 * bidiGenerateContentSetup without a fieldMask locks every setup field, so the
 * server replaces the page's responseModalities: [AUDIO] with its TEXT default
 * and closes the socket with 1007.
 *
 * GET only says whether voice is configured, and mints nothing. The page asks on
 * load, and until 2026-11-11 it asked with POST, so merely opening
 * /interview/voice spent a token.
 */
export const runtime = "edge";

const TOKEN_SERVICE = "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
const NO_STORE = { "cache-control": "no-store" };
const NOT_CONFIGURED = "GEMINI_API_KEYS not configured — voice disabled, use text mode";

/* Each token is a voice session billed to the key, and this route is public, so
   minting is capped per client IP. The counters live in this edge isolate's
   memory: the cap holds per instance, not globally, which stops a script looping
   from one address but not a distributed one. A hard global ceiling needs a
   Vercel Firewall rate-limit rule on this path. 10 per 10 minutes leaves room
   for retries and for several people behind one campus NAT. */
const WINDOW_MS = 10 * 60_000;
const MAX_MINTS_PER_WINDOW = 10;
const recentMints = new Map<string, number[]>();

function admit(ip: string, now: number): number | null {
  const hits = (recentMints.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_MINTS_PER_WINDOW) {
    recentMints.set(ip, hits);
    return Math.ceil((hits[0] + WINDOW_MS - now) / 1000); // seconds until a slot frees
  }
  hits.push(now);
  recentMints.set(ip, hits);
  if (recentMints.size > 5_000) {
    for (const [k, v] of recentMints) if (now - v[v.length - 1] >= WINDOW_MS) recentMints.delete(k);
  }
  return null;
}

function clientIp(request: Request): string {
  // Vercel sets both and overwrites anything the client sent.
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

function liveKeys(): string[] {
  // GEMINI_API_KEYS is the comma-separated rotation list; Live cannot rotate
  // mid-session, so it always gets the primary, exactly as the backend did.
  return (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function GET() {
  if (liveKeys().length === 0) {
    return Response.json({ detail: NOT_CONFIGURED }, { status: 501, headers: NO_STORE });
  }
  return Response.json({ available: true }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const keys = liveKeys();
  if (keys.length === 0) {
    return Response.json({ detail: NOT_CONFIGURED }, { status: 501 });
  }

  const retryAfter = admit(clientIp(request), Date.now());
  if (retryAfter !== null) {
    return Response.json(
      { detail: "too many voice sessions from this network; try again in a few minutes" },
      { status: 429, headers: { ...NO_STORE, "retry-after": String(retryAfter) } },
    );
  }

  const model = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
  const now = Date.now();
  const res = await fetch(TOKEN_SERVICE, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": keys[0] },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      bidiGenerateContentSetup: { model: `models/${model}` },
      fieldMask: "model",
    }),
  }).catch(() => null);

  const minted = res?.ok ? await res.json().catch(() => null) : null;
  if (typeof minted?.name !== "string") {
    // Google's error body stays in the server log; the browser only needs to
    // know voice is unavailable so it can fall back to the form.
    console.error("[live-token] mint failed:", res?.status, res && (await res.text().catch(() => "")));
    return Response.json(
      { detail: `token service unavailable (${res?.status ?? "network error"})` },
      { status: 502, headers: NO_STORE },
    );
  }

  return Response.json(
    { token: minted.name, model, api_version: "v1alpha", mode: "ephemeral" },
    // A credential, however short-lived: never let a CDN or the browser keep it.
    { headers: NO_STORE },
  );
}
