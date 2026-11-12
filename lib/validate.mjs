// Input and output validation, allowlists and length caps.
// Called by chat.mjs and order-status.mjs before any provider or adapter.

import { limits } from './config.mjs';
import { redactDigits } from './redact.mjs';
import { isKnownPersona } from './personas.mjs';

export const INTENTS = Object.freeze(['answer', 'track', 'handoff', 'refuse']);
export const PERSONA_KEYS = Object.freeze(['exchange', 'food', 'cleaning']);
export const TRACKING_NOUNS = Object.freeze(['order', 'booking', 'transaction']);

// Deliberately phrase-based, not word-based. A bare "person" matched
// "do you have a person size portion" — a food question, not a human request.
const HUMAN_WORDS = new RegExp([
  '\\b(human|agent|representative)s?\\b',
  '\\b(reals?\\s+)?person\\b(?!\\s*(size|sized|portion|plate|pack|meal))',
  '\\b(speak|talk)\\s+to\\s+(a\\s+)?(someone|somebody|human|person|agent|representative)\\b',
  '\\bcall\\s+me\\b',
  '\\bwhatsapp\\s+(me|us)\\b',
].join('|'), 'i');

export function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length > max) return null;
  return cleaned;
}

// Returns { ok, message, history } or { ok:false, reason }.
// Async: the persona check consults the client folders on disk.
export async function validateChatInput(body) {
  const cap = limits();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'bad_body' };
  }
  if (!(await isKnownPersona(body.persona))) {
    return { ok: false, reason: 'bad_persona' };
  }

  const raw = cleanText(body.message, cap.messageMax);
  if (!raw) {
    const tooLong = typeof body.message === 'string' && body.message.trim().length > cap.messageMax;
    return { ok: false, reason: tooLong ? 'message_too_long' : 'bad_message' };
  }

  const history = [];
  if (Array.isArray(body.history)) {
    for (const turn of body.history.slice(-cap.historyTurns)) {
      if (!turn || typeof turn !== 'object') continue;
      if (turn.role !== 'user' && turn.role !== 'assistant') continue;
      const content = cleanText(turn.content, cap.historyTurnMax);
      if (!content) continue;
      history.push({ role: turn.role, content });
    }
  }

  return {
    ok: true,
    persona: body.persona,
    // Redaction happens here, once, before anything downstream sees the text.
    message: redactDigits(raw),
    history: history.map((t) => ({ role: t.role, content: redactDigits(t.content) })),
    wantsHuman: HUMAN_WORDS.test(raw),
    injectionSignal: /\b(ignore|disregard)\b.{0,30}\b(instructions?|prompt|rules?)\b/i.test(raw)
      || /\byou are now (the )?(admin|root|developer)\b/i.test(raw)
      || /\b(system prompt|jailbreak|developer mode)\b/i.test(raw),
  };
}

export async function validateStatusInput(body) {
  const cap = limits();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'bad_body' };
  }
  if (!(await isKnownPersona(body.persona))) {
    return { ok: false, reason: 'bad_persona' };
  }
  const reference = cleanText(body.reference, cap.referenceMax);
  if (!reference) return { ok: false, reason: 'bad_reference' };

  const phoneRaw = cleanText(body.phone, cap.phoneMax);
  if (!phoneRaw) return { ok: false, reason: 'bad_phone' };

  return { ok: true, persona: body.persona, reference, phone: phoneRaw };
}

export function validateModelOutput(parsed) {
  const cap = limits();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not_an_object' };
  }
  const allowed = new Set(['reply', 'intent', 'reference']);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) return { ok: false, reason: 'unexpected_field' };
  }

  const reply = typeof parsed.reply === 'string'
    ? parsed.reply.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, cap.replyMax)
    : '';
  if (!reply) return { ok: false, reason: 'bad_reply' };

  const intent = INTENTS.includes(parsed.intent) ? parsed.intent : 'answer';

  const reference = typeof parsed.reference === 'string' ? parsed.reference.trim() : '';

  return { ok: true, value: { reply, intent, reference } };
}

// Server-side truth: the visitor asking for a human always wins over the model.
export function applyHandoff(reply, intent, wantsHuman, hasReference) {
  if (!wantsHuman) return { intent, handoff: false };
  return { intent: 'handoff', handoff: true, reference: hasReference };
}

export function referenceMatches(pattern, reference) {
  if (typeof reference !== 'string' || !reference) return false;
  let re;
  try {
    re = new RegExp(pattern);
  } catch (_) {
    return false;
  }
  return re.test(reference);
}

// "an order" / "a booking" / "a transaction" — the article has to agree.
export function articleFor(noun) {
  return noun === 'order' ? 'an' : 'a';
}
