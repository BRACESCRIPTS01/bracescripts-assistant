// Environment-driven limits, read at call time so a client can be re-tuned
// from the Netlify dashboard without a code change.
// Called by validate.mjs and the channel handlers.

function int(name, fallback) {
  const raw = process.env[name];
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function limits() {
  return {
    messageMax: int('MESSAGE_MAX_CHARS', 500),
    messageMin: 1,
    historyTurns: int('HISTORY_TURNS', 4),
    historyTurnMax: int('HISTORY_TURN_CHARS', 300),
    factsMaxChars: int('FACTS_MAX_CHARS', 4000),
    replyMax: int('REPLY_MAX_CHARS', 600),
    referenceMax: int('REFERENCE_MAX_CHARS', 24),
    phoneMax: int('PHONE_MAX_CHARS', 20),
  };
}
