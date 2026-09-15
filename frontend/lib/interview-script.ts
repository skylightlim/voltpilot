export type IQuestion = {
  key: string;
  kind: "choice" | "number" | "boolean" | "postcode";
  options?: string[];
  required: boolean;
  en: string;
  bm?: string;
};

/* Mirrors backend INTERVIEW_QUESTIONS, in the same order. Only used when
   GET /config/interview fails; the backend is the source of truth and both the
   intake flow and the voice advisor fetch it. Kept aligned because a fallback
   that asks different questions is worse than no fallback: it collects fields
   the engine does not read and skips ones it does.
   backend/tests/test_postcode.py fails if the two drift. */
export const FALLBACK_SCRIPT: IQuestion[] = [
  { key: "daily_km", kind: "number", required: true, en: "How far do you drive on a typical day? (km)", bm: "Berapa km anda memandu pada hari biasa?" },
  { key: "trips_per_week", kind: "number", required: true, en: "About how many days a week do you drive?", bm: "Berapa hari seminggu anda memandu?" },
  { key: "long_trip_frequency", kind: "choice", options: ["rarely", "monthly", "weekly"], required: true, en: "How often do you take long trips (over 100 km)?", bm: "Berapa kerap anda buat perjalanan jauh (lebih 100 km)?" },
  { key: "destination_region", kind: "choice", options: ["kl", "north", "south", "east_coast", "east_malaysia", "singapore"], required: true, en: "Where do your long trips usually go?", bm: "Biasanya perjalanan jauh anda pergi ke mana?" },
  { key: "can_charge_home", kind: "boolean", required: true, en: "Can you charge at home (a power socket or planned charger near your parking)?", bm: "Bolehkah anda mengecas di rumah (ada soket kuasa atau pengecas di tempat letak kereta anda)?" },
  { key: "can_charge_work", kind: "boolean", required: false, en: "Can you also charge at your workplace?", bm: "Bolehkah anda juga mengecas di tempat kerja?" },
  { key: "home_postcode", kind: "postcode", required: true, en: "What is your home postcode? (5 digits)", bm: "Apakah poskod rumah anda? (5 digit)" },
  { key: "monthly_electricity_bill_rm", kind: "number", required: false, en: "Roughly what is your monthly electricity bill? (RM, say zero if unsure)", bm: "Lebih kurang berapa bil elektrik bulanan anda? (RM, sebut sifar jika tidak pasti)" },
  { key: "budget_max_rm", kind: "number", required: true, en: "What is your maximum budget for the car? (RM)", bm: "Berapakah bajet maksimum anda untuk kereta? (RM)" },
  { key: "consider_solar", kind: "boolean", required: false, en: "Are you considering solar panels at home?", bm: "Adakah anda mempertimbangkan panel solar di rumah?" },
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
    south: { en: "South (JB / Melaka)", bm: "Selatan (JB / Melaka)" },
    east_coast: { en: "East Coast (Kuantan / Kota Bharu)", bm: "Pantai Timur (Kuantan / Kota Bharu)" },
    east_malaysia: { en: "East Malaysia", bm: "Malaysia Timur" },
    singapore: { en: "Cross-border to Singapore", bm: "Lintas sempadan ke Singapura" },
  },
};

export const KILOMETRE_CHIPS = [20, 40, 60, 100, 150];
export const KM_OPTIONS = [50, 100, 150, 300, 500];