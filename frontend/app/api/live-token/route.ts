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
 */
export const runtime = "edge";

const TOKEN_SERVICE = "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
const NO_STORE = { "cache-control": "no-store" };

export async function POST() {
  // GEMINI_API_KEYS is the comma-separated rotation list; Live cannot rotate
  // mid-session, so it always gets the primary, exactly as the backend did.
  const keys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return Response.json(
      { detail: "GEMINI_API_KEYS not configured — voice disabled, use text mode" },
      { status: 501 },
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
