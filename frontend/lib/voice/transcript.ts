/**
 * Pure reducers for the voice interview's message log.
 *
 * The branching here is subtle and easy to break: streamed advisor text appends
 * to the previous bubble, an interim user line is replaced rather than appended,
 * and the seeded status row (id "open") must never be merged into. That logic
 * sat inside a 1,066-line component next to a live WebSocket, so it could only
 * be exercised with a real Gemini session.
 *
 * These take the current log and return the next one. Ids and timestamps are
 * passed in rather than generated, so a test can assert on exact output.
 */

export type VoiceRole = "advisor" | "user" | "system";

export type VoiceMsg = {
  id: string;
  role: VoiceRole;
  text: string;
  time?: string;
  isInterim?: boolean;
};

/** The seeded connection-status row. Advisor text must never merge into it. */
export const STATUS_ID = "open";

/**
 * Streamed text from the advisor (or the user's server transcript).
 * Appends to the previous bubble when it belongs to the same speaker,
 * otherwise starts a new one.
 */
export function appendDelta(
  log: VoiceMsg[],
  role: "advisor" | "user",
  delta: string,
  id: string,
  time: string,
): VoiceMsg[] {
  const last = log[log.length - 1];

  if (last && last.role === role && last.id !== STATUS_ID && !last.isInterim) {
    // same speaker still talking — grow the existing bubble
    return [...log.slice(0, -1), { ...last, text: last.text + delta }];
  }
  if (last && last.role === role && last.isInterim) {
    // a confirmed line supersedes the interim guess for the same speaker
    return [...log.slice(0, -1), { id, role, text: delta, time, isInterim: false }];
  }
  return [...log, { id, role, text: delta, time, isInterim: false }];
}

/**
 * Live, unconfirmed speech-to-text for the user. Replaces the previous interim
 * line so the bubble updates in place instead of stuttering down the screen.
 */
export function withInterim(
  log: VoiceMsg[],
  text: string,
  id: string,
  time: string,
): VoiceMsg[] {
  const last = log[log.length - 1];
  if (last && last.role === "user" && last.isInterim) {
    return [...log.slice(0, -1), { ...last, text }];
  }
  return [...log, { id, role: "user", text, time, isInterim: true }];
}

/**
 * A confirmed user utterance. Replaces the trailing user line — interim or not —
 * so the final transcript wins over the live guess.
 */
export function withFinalUser(
  log: VoiceMsg[],
  text: string,
  id: string,
  time: string,
): VoiceMsg[] {
  const last = log[log.length - 1];
  const msg: VoiceMsg = { id, role: "user", text: text.trim(), time, isInterim: false };
  if (last && last.role === "user") {
    return [...log.slice(0, -1), msg];
  }
  return [...log, msg];
}

/** Promote the seeded status row in place, rather than appending a second one. */
export function promoteStatus(log: VoiceMsg[], text: string, time: string): VoiceMsg[] {
  return log.map((m) => (m.id === STATUS_ID ? { ...m, text, time } : m));
}
