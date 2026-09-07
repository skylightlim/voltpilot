const BACKEND_URL =
  typeof window !== "undefined"
    ? "/api/proxy"
    : process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:8000";

/* Exported for diagnostics only. NEVER render this into JSX: it resolves to the
   direct backend host on the server and to "/api/proxy" on the client, so any
   markup containing it fails hydration — and it would publish the backend's
   internal address into the HTML of every page that did. A hidden <span> on the
   voice page did exactly that. tests/guardrails.test.mjs now checks for it. */
export { BACKEND_URL };

export type Profile = {
  language: "en" | "bm";
  daily_km: number;
  trips_per_week: number;
  long_trip_frequency: "rarely" | "monthly" | "weekly";
  long_trip_km: number;
  destination_region: "kl" | "north" | "south" | "east_coast" | "east_malaysia" | "singapore";
  can_charge_home: boolean;
  can_charge_work: boolean;
  home_postcode: string;
  work_postcode?: string;
  consider_solar: boolean;
  budget_max_rm?: number;
  grid_region: "peninsular" | "east_malaysia";
  monthly_electricity_bill_rm?: number;
};

export type InfraStatus = "good" | "moderate" | "limited" | "very_poor" | "poor";

export type Weights = {
  save_money: number;
  environment: number;
  convenience: number;
  future_proofing: number;
};

export type InterviewQuestion = {
  key: string;
  kind: "choice" | "number" | "boolean" | "postcode";
  options?: string[];
  required: boolean;
  en: string;
  bm?: string;
};

const DEFAULT_PROFILE: Profile = {
  language: "en",
  daily_km: 0,
  trips_per_week: 0,
  long_trip_frequency: "rarely",
  long_trip_km: 0,
  destination_region: "kl",
  can_charge_home: true,
  can_charge_work: false,
  home_postcode: "",
  consider_solar: false,
  grid_region: "peninsular",
  monthly_electricity_bill_rm: 0,
};

const DEFAULT_WEIGHTS: Weights = {
  save_money: 50,
  environment: 50,
  convenience: 50,
  future_proofing: 50,
};

// sessionStorage keys — profile + weights live client-side (no auth, D16)
const PROFILE_KEY = "atp.profile";
const WEIGHTS_KEY = "atp.weights";
const TOKEN_KEY = "atp.token";
const RESULTS_KEY = "atp.results";

/** Wait this long before giving up. The backend is a container that cold-starts,
 *  so the first request after an idle period is legitimately slow — but not
 *  indefinitely, and a hung request with no timeout hangs the UI forever. */
const TIMEOUT_MS = 45_000;

/**
 * What went wrong, in terms a page can act on. Kept as a code rather than a
 * message so the copy stays in lib/i18n.ts and both languages are served —
 * see the "err.*" keys.
 */
export type ApiErrorKind =
  | "offline"       // the request never reached the server
  | "timeout"       // it reached the server and nothing came back in time
  | "rate_limited"  // 429
  | "not_found"     // 404
  | "invalid"       // 4xx from our own bad input
  | "server"        // 5xx
  | "unknown";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  kind: ApiErrorKind;
  retryAfterSeconds?: number;

  constructor(status: number, detail: unknown, kind: ApiErrorKind = "unknown") {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.kind = kind;
  }

  /** i18n key for a message that can be shown to a person. */
  get messageKey(): string {
    return `err.${this.kind}`;
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 429) return "rate_limited";
  if (status === 404) return "not_found";
  if (status >= 500) return "server";
  if (status >= 400) return "invalid";
  return "unknown";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    });
  } catch (err) {
    // fetch rejects on DNS failure, connection refused, offline and abort.
    // Unwrapped, these surfaced as a raw "TypeError: Failed to fetch" and the
    // page rendered nothing — the blank screen during a container cold start.
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiError(0, String(err), timedOut ? "timeout" : "offline");
  }

  if (!res.ok) {
    let detail: unknown = await res.text().catch(() => "");
    try {
      detail = JSON.parse(detail as string);
    } catch {
      /* keep the text body */
    }
    const error = new ApiError(res.status, detail, kindForStatus(res.status));
    if (res.status === 429) {
      const header = Number(res.headers.get("Retry-After"));
      const body = (detail as { retry_after_seconds?: number })?.retry_after_seconds;
      error.retryAfterSeconds = header || body || 60;
    }
    throw error;
  }

  try {
    return (await res.json()) as T;
  } catch {
    // 200 with a body that is not JSON — a proxy error page, usually.
    throw new ApiError(res.status, "malformed response body", "server");
  }
}

export const SESSION = {
  loadProfile: (): Profile =>
    JSON.parse(typeof window !== "undefined" ? sessionStorage.getItem(PROFILE_KEY) || "null" : "null") ||
    DEFAULT_PROFILE,
  saveProfile: (p: Profile) => sessionStorage.setItem(PROFILE_KEY, JSON.stringify(p)),
  loadWeights: (): Weights =>
    JSON.parse(typeof window !== "undefined" ? sessionStorage.getItem(WEIGHTS_KEY) || "null" : "null") ||
    DEFAULT_WEIGHTS,
  saveWeights: (w: Weights) => sessionStorage.setItem(WEIGHTS_KEY, JSON.stringify(w)),
  loadToken: (): string | null =>
    typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) : null,
  saveToken: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),

  /* The waiting page fetches the results payload before it hands over, so the
     results page can paint finished content on its first frame instead of a
     "Compiling your analysis…" spinner the user has already sat through. */
  saveResults: (token: string, data: unknown) => {
    try {
      sessionStorage.setItem(RESULTS_KEY, JSON.stringify({ token, data }));
    } catch {
      /* quota or private mode — the results page just fetches instead */
    }
  },
  loadResults: (token: string): unknown | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(RESULTS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.token === token ? parsed.data : null;
    } catch {
      return null;
    }
  },
};

export const apiService = {
  postProfile: (p: Profile) =>
    api<{ token: string; missing_required: string[]; next_step: string }>("/profile", {
      method: "POST",
      body: JSON.stringify(p),
    }),
  postScore: (token: string, profile: Profile, weights: Weights) =>
    api<{ token: string; solar_eligible: boolean; ranked: number }>("/score", {
      method: "POST",
      body: JSON.stringify({ token, profile, weights }),
    }),
  getResults: (token: string) => api<any>(`/results/${token}`),
  getRecommendation: (token: string) => api<any>(`/results/${token}/recommendation`),
  getInfrastructure: (token: string) =>
    api<{
      area: { count: number; radius_km: number; status: InfraStatus };
      route: {
        destination_region: string;
        local: boolean;
        status: InfraStatus;
        route_km?: number;
        stations?: number;
        density_per_100km?: number;
        max_gap_km?: number;
        corridor_km?: number;
      };
      source: string;
    }>(`/results/${token}/infrastructure`),
  postChat: (result_token: string, message: string, language: "en" | "bm") =>
    api<{ reply: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ result_token, message, language }),
    }),
  getChatHistory: (result_token: string) =>
    api<{ messages: { role: string; content: string }[] }>(`/chat/messages/${result_token}`),
  postReport: (result_token: string, email: string) =>
    api<{ sent: boolean; first: boolean; email: string }>("/report", {
      method: "POST",
      body: JSON.stringify({ result_token, email }),
    }),
  getInterviewScript: () => api<{ questions: InterviewQuestion[] }>("/config/interview"),
  extractInterview: (transcript: string, lang: string = "en") =>
    api<{ profile: Partial<Profile> }>("/interview/extract", {
      method: "POST",
      body: JSON.stringify({ transcript, lang }),
    }),
  getSolar: () => api<{ solar: any }>("/config/solar"),
  getSponsor: () => api<{ sponsor: any }>("/config/sponsor"),
  /** Same-origin edge route, not the Python backend: /tokens/live cost 8.9s on a
   *  cold function and it sits on the session-start path. See app/api/live-token. */
  getLiveToken: () =>
    fetch("/api/live-token", { method: "POST" }).then(async (r) => {
      if (!r.ok) throw new ApiError(r.status, await r.text().catch(() => ""), kindForStatus(r.status));
      return r.json() as Promise<{ token: string; model: string; api_version: string }>;
    }),
};