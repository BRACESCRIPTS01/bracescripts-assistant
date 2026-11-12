// One JSON log line per request. Never the message, the reply, or a phone number.
// Called by Netlify/functions/chat.mjs and order-status.mjs.

export function logRequest(fields) {
  const line = {
    ts: new Date().toISOString(),
    event: 'chat',
    persona: fields.persona || null,
    intent: fields.intent || null,
    provider: fields.provider || null,
    status: fields.status ?? null,
    reason: fields.reason || null,
    handoff: fields.handoff === true,
    ms: fields.ms ?? null,
  };
  try {
    console.log(JSON.stringify(line));
  } catch (_) {
    console.log('{"event":"chat","reason":"log_failed"}');
  }
}
