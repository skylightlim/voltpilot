import { CHOICE_LABELS, type IQuestion } from "@/lib/interview-script";

/* The voice advisor's system prompt, derived from the interview script.
 *
 * It used to be a third hardcoded copy of that script, after
 * schemas.INTERVIEW_QUESTIONS and the manual form, written out in full in both
 * languages. It went stale the day the grid-region question was derived from
 * the postcode and removed: the advisor kept asking for it and announcing
 * eleven questions. issue.md issue 23.
 *
 * What blocked deriving it was the belief that the prompt carries per-question
 * phrasing and answer formats the config does not model. It does not: `kind`
 * gives the answer format, `options` plus CHOICE_LABELS give the readable
 * choices, and `en`/`bm` give the wording. Only the conversational rules below
 * are genuinely prompt-only, and those do not name a single question.
 */

type Lang = "en" | "bm";

/** Asked by the UI to pick a language, never by an advisor already speaking one. */
const NOT_SPOKEN = new Set(["language"]);

const COPY = {
  en: {
    role: "You are the AI interviewer for a Malaysian EV vs Hybrid decision guide.",
    ask: (n: number) => `Ask the user exactly ${n} questions, one at a time, in this order:`,
    rules: "RULES:",
    rule: [
      "- Ask ONE question at a time. Wait for the user's answer.",
      "- After each answer, briefly confirm what you heard, then ask the next question.",
      "- Keep responses short and conversational.",
    ],
    after: (n: number) => `AFTER all ${n} questions are answered:`,
    steps: [
      '1. Say: "Let me confirm all your answers."',
      "2. Read back each answer clearly.",
      '3. Ask: "Is everything correct? Say yes to confirm, or tell me what to change."',
      "4. If user says yes/confirm/correct → your VERY LAST message must be exactly: INTERVIEW_COMPLETE",
      "5. If user wants changes → update and re-confirm.",
    ],
    end: "IMPORTANT: When confirmed, end with exactly this word and nothing else: INTERVIEW_COMPLETE",
    yesNo: "yes / no",
    postcode: "5 digits",
    greet: (n: number, first: string) =>
      `Introduce yourself briefly as the VoltPilot AI Advisor. Greet the user, tell them you will ask ${n} quick questions to help decide between an EV or hybrid, then immediately ask the first question: ${first}`,
  },
  bm: {
    role: "Anda adalah penasihat AI untuk panduan keputusan EV vs Hibrid Malaysia.",
    ask: (n: number) => `Tanya pengguna tepat ${n} soalan, satu demi satu, dalam urutan ini:`,
    rules: "PERATURAN:",
    rule: [
      "- Tanya SATU soalan pada satu masa. Tunggu jawapan pengguna.",
      "- Selepas setiap jawapan, sahkan secara ringkas apa yang anda dengar, kemudian tanya soalan seterusnya.",
      "- Pastikan jawapan pendek dan santai.",
    ],
    after: (n: number) => `SELEPAS semua ${n} soalan dijawab:`,
    steps: [
      '1. Kata: "Biar saya sahkan semua jawapan anda."',
      "2. Bacakan setiap jawapan dengan jelas.",
      '3. Tanya: "Semuanya betul? Kata ya untuk sahkan, atau beritahu saya apa yang perlu diubah."',
      "4. Jika pengguna kata ya/sah/betul → mesej TERAKHIR anda mestilah tepat: INTERVIEW_COMPLETE",
      "5. Jika pengguna mahu perubahan → kemas kini dan sahkan semula.",
    ],
    end: "PENTING: Apabila disahkan, tamatkan dengan tepat perkataan ini sahaja: INTERVIEW_COMPLETE",
    yesNo: "ya / tidak",
    postcode: "5 digit",
    greet: (n: number, first: string) =>
      `Perkenalkan diri anda secara ringkas sebagai Penasihat AI VoltPilot. Sapa pengguna, beritahu mereka anda akan bertanya ${n} soalan pantas untuk membantu memilih antara EV atau hibrid, kemudian terus tanya soalan pertama: ${first}`,
  },
} as const;

/** Questions a spoken advisor should actually ask, in order. */
export function spokenQuestions(questions: IQuestion[]): IQuestion[] {
  return questions.filter((q) => !NOT_SPOKEN.has(q.key));
}

/** "(yes / no)", "(5 digits)", "(rarely / monthly / weekly)" — or nothing. */
function answerHint(q: IQuestion, lang: Lang): string {
  const c = COPY[lang];
  if (q.kind === "boolean") return ` (${c.yesNo})`;
  if (q.kind === "postcode") return ` (${c.postcode})`;
  if (q.kind === "choice" && q.options?.length) {
    const labels = q.options.map((o) => CHOICE_LABELS[q.key]?.[o]?.[lang] ?? o);
    return ` (${labels.join(" / ")})`;
  }
  return "";
}

export function questionLine(q: IQuestion, index: number, lang: Lang): string {
  const text = (lang === "bm" && q.bm) || q.en;
  return `${index + 1}. ${text}${answerHint(q, lang)}`;
}

export function buildInterviewPrompt(questions: IQuestion[], lang: Lang): string {
  const asked = spokenQuestions(questions);
  const c = COPY[lang];
  return [
    c.role,
    c.ask(asked.length),
    "",
    ...asked.map((q, i) => questionLine(q, i, lang)),
    "",
    c.rules,
    ...c.rule,
    "",
    c.after(asked.length),
    ...c.steps,
    "",
    c.end,
  ].join("\n");
}

export function buildGreeting(questions: IQuestion[], lang: Lang): string {
  const asked = spokenQuestions(questions);
  const first = asked[0] ? ((lang === "bm" && asked[0].bm) || asked[0].en) : "";
  return COPY[lang].greet(asked.length, first);
}
