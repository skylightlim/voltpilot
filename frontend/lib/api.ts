const BACKEND_URL =
  typeof window !== "undefined"
    ? "/api/proxy"
    : process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:8000";

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail: unknown = await res.text();
    try {
      detail = await res.json();
    } catch {
      /* keep text */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
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
  getLiveToken: () => api<{ token: string; model: string; api_version: string }>("/tokens/live", { method: "POST" }),
};