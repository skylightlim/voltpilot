import { test, expect } from "@playwright/test";
import { buildGreeting, buildInterviewPrompt, spokenQuestions } from "../../lib/voice-prompt";
import { FALLBACK_SCRIPT, type IQuestion } from "../../lib/interview-script";

/* The prompt is derived, so the guarantee worth testing is that it cannot
 * disagree with the script it derives from. issue.md issue 23. */

const LANGS = ["en", "bm"] as const;

for (const lang of LANGS) {
  test(`[${lang}] the announced count equals the questions actually listed`, () => {
    const prompt = buildInterviewPrompt(FALLBACK_SCRIPT, lang);
    // only the question block: the closing instructions are numbered too
    const questionBlock = prompt.split(/^(?:RULES|PERATURAN):$/m)[0];
    const listed = [...questionBlock.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    const expected = spokenQuestions(FALLBACK_SCRIPT).length;

    expect(listed).toEqual([...Array(expected)].map((_, i) => i + 1));
    // every statement of the count, in the header and the closing instructions
    for (const [, n] of prompt.matchAll(/(?:exactly|all|tepat|semua)\s+(\d+)\s+(?:questions|soalan)/g)) {
      expect(Number(n)).toBe(expected);
    }
    expect(Number(buildGreeting(FALLBACK_SCRIPT, lang).match(/(\d+)\s+(?:quick questions|soalan pantas)/)![1]))
      .toBe(expected);
  });

  test(`[${lang}] a question added to the script appears without touching the prompt`, () => {
    // The defect: the script changed and the prompt did not.
    const extended: IQuestion[] = [
      ...FALLBACK_SCRIPT,
      { key: "tow_caravan", kind: "boolean", required: false,
        en: "Do you tow a caravan?", bm: "Adakah anda menarik karavan?" },
    ];
    const prompt = buildInterviewPrompt(extended, lang);
    expect(prompt).toContain(lang === "bm" ? "menarik karavan" : "tow a caravan");
    expect(prompt).toMatch(
      new RegExp(`(?:exactly|tepat)\\s+${spokenQuestions(extended).length}\\s+(?:questions|soalan)`),
    );
  });

  test(`[${lang}] answer formats come from the question kind`, () => {
    const prompt = buildInterviewPrompt(FALLBACK_SCRIPT, lang);
    expect(prompt).toContain(lang === "bm" ? "(ya / tidak)" : "(yes / no)");
    expect(prompt).toContain(lang === "bm" ? "(5 digit)" : "(5 digits)");
    // choices are spelled out with their human labels, not their raw keys
    expect(prompt).toMatch(lang === "bm" ? /Lintas sempadan ke Singapura/ : /Cross-border to Singapore/);
    expect(prompt).not.toMatch(/\beast_coast\b|\beast_malaysia\b/);
  });
}

test("the language picker is never spoken, since the advisor already has one", () => {
  const withLang: IQuestion[] = [
    { key: "language", kind: "choice", options: ["en", "bm"], required: true, en: "Which language?" },
    ...FALLBACK_SCRIPT,
  ];
  expect(spokenQuestions(withLang).map((q) => q.key)).not.toContain("language");
  expect(buildInterviewPrompt(withLang, "en")).not.toContain("Which language?");
});
