export type IQuestion = {
  key: string;
  kind: "choice" | "number" | "boolean" | "postcode";
  options?: string[];
  required: boolean;
  en: string;
  bm?: string;
};

export const FALLBACK_SCRIPT: IQuestion[] = [
  { key: "language", kind: "choice", options: ["en", "bm"], required: true, en: "Which language should we use?", bm: "Bahasa apa yang kami patut guna?" },
  { key: "daily_km", kind: "number", required: true, en: "How far do you drive on a typical day?", bm: "Berapa km anda memandu pada hari biasa?" },
  { key: "trips_per_week", kind: "number", required: true, en: "About how many days a week do you drive?", bm: "Berapa hari seminggu anda memandu?" },
  { key: "long_trip_frequency", kind: "choice", options: ["rarely", "monthly", "weekly"], required: true, en: "How often do you take long trips (over 100 km)?", bm: "Berapa kerap anda buat perjalanan jauh?" },
  { key: "long_trip_km", kind: "number", required: false, en: "How long is a typical long trip? (km)", bm: "Berapa km perjalanan jauh biasa anda?" },
  { key: "destination_region", kind: "choice", options: ["kl", "north", "south", "east_coast", "east_malaysia", "singapore"], required: true, en: "Where do your long trips usually go?", bm: "Ke mana perjalanan jauh anda biasanya?" },
  { key: "can_charge_home", kind: "boolean", required: true, en: "Can you charge at home?", bm: "Bolehkah anda mengecas di rumah?" },
  { key: "home_postcode", kind: "postcode", required: true, en: "What is your home postcode?", bm: "Apakah poskod rumah anda?" },
  { key: "work_postcode", kind: "postcode", required: false, en: "Optional — work postcode?", bm: "Opsional — poskod tempat kerja?" },
  { key: "consider_solar", kind: "boolean", required: false, en: "Are you considering solar panels at home?", bm: "Adakah anda mempertimbangkan panel solar?" },
  { key: "budget_max_rm", kind: "number", required: false, en: "Optional — your maximum budget?", bm: "Opsional — belanjawan maksimum?" },
];

export function questionText(q: IQuestion, lang: "en" | "bm"): string {
  if (lang === "bm" && q.bm) return q.bm;
  return q.en;
}

export const CHOICE_LABELS: Record<string, Record<string, { en: string; bm: string }>> = {
  long_trip_frequency: {
    rarely: { en: "Rarely — a few times a year", bm: "Jarang — beberapa kali setahun" },
    monthly: { en: "About once a month", bm: "Lag lebih sebulan sekali" },
    weekly: { en: "Every week", bm: "Setiap minggu" },
  },
  destination_region: {
    kl: { en: "Around Klang Valley", bm: "Keliling Lembah Klang" },
    north: { en: "North (Penang / Perak)", bm: "Utara (Pulau Pinang / Perak)" },
    south: { en: "South (JB / Singapore)", bm: "Selatan (JB / Singapura)" },
    east_coast: { en: "East Coast (Kuantan / Kota Bharu)", bm: "Pantai Timur (Kuantan / Kota Bharu)" },
    east_malaysia: { en: "East Malaysia", bm: "Malaysia Timur" },
    singapore: { en: "Cross-border to Singapore", bm: "Lintas sempadan ke Singapura" },
  },
};

export const KILOMETRE_CHIPS = [20, 40, 60, 100, 150];
export const KM_OPTIONS = [50, 100, 150, 300, 500];