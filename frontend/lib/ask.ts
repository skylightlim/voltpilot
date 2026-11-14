import type { StrKey } from "./i18n";

/** Ready-made questions for the AI analyst. The results page shows the first
 *  four under "Ask AI"; the chat shows them all as chips. A chip on the results
 *  page links to the chat with the question in `?q=`, and the chat sends it as
 *  soon as it loads, so one tap gets an answer. */
export const ASK_PROMPTS: readonly StrKey[] = [
  "ask.family",
  "ask.cheaper",
  "ask.service",
  "ask.solar",
  "ask.subsidy",
  "ask.charge",
  "ask.top2",
];

export const askHref = (token: string, question: string) =>
  `/chat/${token}?q=${encodeURIComponent(question)}`;
