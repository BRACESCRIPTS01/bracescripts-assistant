// POST /api/chat. Validates input, asks the model, validates the answer.
// Called by widget/chat-widget.js. Holds no secrets itself: providers.mjs reads
// the API keys from the environment.

import { validateChatInput, validateModelOutput, applyHandoff, referenceMatches } from '../../lib/validate.mjs';
import { loadPersona } from '../../lib/personas.mjs';
import { buildSystemPrompt } from '../../lib/prompt.mjs';
import { callModel } from '../../lib/providers.mjs';
import { buildHandoffText, waLink } from '../../lib/status-text.mjs';
import { json, corsHeaders, originAllowed, preflight, readJson, takeToken, clientKey } from '../../lib/http.mjs';
import { logRequest } from '../../lib/log.mjs';

export const config = {
  path: '/api/chat',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

export default async (request) => {
  const started = Date.now();
  const done = (status, payload, extra) => {
    logRequest({
      status,
      reason: payload.error || null,
      intent: payload.intent || null,
      provider: payload.meta && payload.meta.provider,
      handoff: Boolean(payload.handoff),
      ms: Date.now() - started,
    });
    return json(status, payload, { ...corsHeaders(request), ...(extra || {}) });
  };

  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') {
    return done(405, { error: 'method_not_allowed', message: 'POST only.' }, { allow: 'POST' });
  }
  if (String(process.env.CHAT_ENABLED || 'true').toLowerCase() === 'false') {
    return done(503, {
      error: 'offline',
      message: 'The assistant is offline right now. Please message us on WhatsApp and a person will help you.',
    });
  }
  if (!originAllowed(request)) {
    return done(403, { error: 'origin', message: 'This endpoint only accepts requests from its own site.' });
  }

  const limit = takeToken(clientKey(request), 10);
  if (!limit.allowed) {
    return done(429, {
      error: 'busy',
      message: 'You are sending messages faster than I can answer. Please wait a moment and try again.',
    }, { 'retry-after': String(limit.retryAfter || 60) });
  }

  const body = await readJson(request);
  if (!body.ok) {
    return done(body.reason === 'body_too_large' ? 413 : 400, {
      error: body.reason,
      message: body.reason === 'body_too_large' ? 'That message is too large.' : 'Body must be valid JSON.',
    });
  }

  const input = validateChatInput(body.value);
  if (!input.ok) {
    const status = input.reason === 'message_too_long' ? 413 : 400;
    const message = input.reason === 'message_too_long'
      ? 'That message is too long. Please keep it under 500 characters.'
      : 'Please type a question.';
    return done(status, { error: input.reason, message });
  }

  let persona;
  try {
    persona = await loadPersona(input.persona);
  } catch (err) {
    // A misconfigured persona is our fault, not the visitor's. Never leak detail.
    logRequest({ status: 500, reason: err.code || 'persona_load_failed', ms: Date.now() - started });
    return json(500, {
      error: 'misconfigured',
      message: 'Something went wrong on our side. Please message us on WhatsApp.',
    }, corsHeaders(request));
  }

  // A visitor asking for a human does not need a model call at all.
  if (input.wantsHuman) {
    const url = waLink(persona.config, buildHandoffText(persona.config, input.message, ''));
    return done(200, {
      reply: 'Of course. Tap the WhatsApp button and a person will reply.',
      intent: 'handoff',
      reference: '',
      handoff: url ? { url } : null,
      meta: { provider: 'none', ms: Date.now() - started },
    });
  }

  const result = await callModel({
    systemPrompt: buildSystemPrompt(persona),
    history: input.history,
    message: input.message,
  });

  if (!result.ok) {
    const busy = result.reason === 'busy';
    const url = waLink(persona.config, buildHandoffText(persona.config, input.message, ''));
    return done(busy ? 429 : 502, {
      error: busy ? 'busy' : 'unavailable',
      message: busy
        ? 'I am getting a lot of questions right now. Please try again in a minute, or message us on WhatsApp.'
        : 'I cannot answer right now. Please message us on WhatsApp and a person will help you.',
      handoff: url ? { url } : null,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(result.raw);
  } catch (_) {
    return done(502, {
      error: 'bad_model_output',
      message: 'I am not confident I can answer that correctly. Please message us on WhatsApp.',
    });
  }

  const validated = validateModelOutput(parsed);
  if (!validated.ok) {
    return done(502, {
      error: 'bad_model_output',
      message: 'I am not confident I can answer that correctly. Please message us on WhatsApp.',
    });
  }

  // The server decides, not the model.
  let reference = '';
  if (validated.value.reference && referenceMatches(persona.config.referencePattern, validated.value.reference)) {
    reference = validated.value.reference;
  }
  const decision = applyHandoff(validated.value.reply, validated.value.intent, input.wantsHuman, Boolean(reference));

  // The model escalating is just as real as the visitor asking. Either one must
  // produce a working button, or the bot admits it cannot help and leaves the
  // customer with nowhere to go.
  const wantsHandoff = decision.handoff || validated.value.intent === 'handoff';
  const handoffUrl = wantsHandoff
    ? waLink(persona.config, buildHandoffText(persona.config, input.message, reference))
    : null;

  logRequest({
    persona: persona.key,
    intent: decision.intent,
    provider: result.provider,
    status: 200,
    handoff: decision.handoff,
    ms: Date.now() - started,
  });

  return json(200, {
    reply: validated.value.reply,
    intent: decision.intent,
    reference,
    handoff: handoffUrl ? { url: handoffUrl } : null,
    meta: { provider: result.provider, ms: Date.now() - started },
  }, corsHeaders(request));
};
