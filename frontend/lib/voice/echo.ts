/**
 * Echo suppression for the live voice interview.
 *
 * The advisor's own speech is picked up by the microphone and comes back as a
 * user transcript. This decides whether a transcribed line is really the
 * advisor talking to itself, so the interview does not answer its own question.
 *
 * Moved verbatim out of app/interview/voice/page.tsx so it can be tested
 * without a microphone or a live session.
 */

export // Semantic echo detector that identifies if transcribed text is actually the advisor's question or statement
function isEchoOfAdvisor(text: string, recentPhrases: string[]): boolean {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (clean.length < 3) return false;

  const forbiddenQuestionPatterns = [
    "introduce yourself",
    "voltpilot",
    "ai advisor",
    "penasihat ai",
    "quick questions",
    "soalan pantas",
    "how many kilometres",
    "how many kilometers",
    "how many km",
    "berapa kilometer",
    "typical day",
    "hari biasa",
    "how many days a week",
    "berapa hari seminggu",
    "long trips over 100",
    "perjalanan jauh melebihi",
    "perjalanan jauh",
    "where do your long trips",
    "ke mana destinasi",
    "klang valley",
    "lembah klang",
    "can you charge an ev at home",
    "can you charge at home",
    "bolehkah anda mengecas",
    "charge at home",
    "cas di rumah",
    "charge at your workplace",
    "mengecas di tempat kerja",
    "home postcode",
    "poskod rumah",
    "5 digits",
    "5 digit",
    "peninsular grid",
    "grid semenanjung",
    "sabah or sarawak",
    "sabah atau sarawak",
    "monthly electricity bill",
    "bil elektrik bulanan",
    "say zero if unsure",
    "sebut sifar",
    "maximum budget for the car",
    "bajet maksimum anda",
    "considering solar panels",
    "mempertimbangkan panel solar",
    "solar panels at home",
    "panel solar",
    "let me confirm",
    "biar saya sahkan",
    "is everything correct",
    "adakah semuanya betul",
    "say yes to confirm",
    "katakan ya untuk sahkan",
    "interview_complete",
    "interview complete",
    "welcome to voltpilot",
    "first question",
    "soalan pertama",
    "tell me what to change",
  ];

  for (const pattern of forbiddenQuestionPatterns) {
    if (clean.includes(pattern)) {
      return true;
    }
  }

  // Check overlap against what the advisor recently spoke
  const words = clean.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return false;

  for (const recent of recentPhrases) {
    const cleanRecent = recent.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    if (cleanRecent.includes(clean) && clean.length > 6) {
      return true;
    }
    let matchCount = 0;
    for (const w of words) {
      if (cleanRecent.includes(w)) matchCount++;
    }
    if (words.length >= 3 && matchCount / words.length >= 0.5) {
      return true;
    }
  }

  return false;
}
