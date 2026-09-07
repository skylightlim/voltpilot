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
 * Served from the edge runtime instead, it is a env-var read with no cold start
 * worth measuring. The value returned is unchanged, and so is the security
 * posture: the key was always handed to the browser to open the Live socket.
 */
export const runtime = "edge";

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

  return Response.json(
    {
      token: keys[0],
      model: process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview",
      api_version: "v1beta",
      mode: "key",
    },
    // A credential, however short-lived: never let a CDN or the browser keep it.
    { headers: { "cache-control": "no-store" } },
  );
}
