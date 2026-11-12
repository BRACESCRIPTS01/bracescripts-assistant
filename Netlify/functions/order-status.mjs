// POST /api/status. Reference + phone -> order status. NEVER calls a model.
// Called by widget/chat-widget.js. The phone never leaves this function.

import { validateStatusInput } from '../../lib/validate.mjs';
import { loadPersona } from '../../lib/personas.mjs';
import { findRecord } from '../../lib/adapters/demo.mjs';
import { buildStatusReply, notFoundText, buildHandoffText, waLink } from '../../lib/status-text.mjs';
import { json, corsHeaders, originAllowed, preflight, readJson, takeToken, clientKey } from '../../lib/http.mjs';
import { logRequest } from '../../lib/log.mjs';

export const config = {
  path: '/api/status',
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

export default async (request) => {
  const started = Date.now();

  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed', message: 'POST only.' }, { allow: 'POST' });
  }
  if (!originAllowed(request)) {
    return json(403, { error: 'origin', message: 'This endpoint only accepts requests from its own site.' },
      corsHeaders(request));
  }

  const limit = takeToken(clientKey(request), 6);
  if (!limit.allowed) {
    return json(429, { error: 'busy', message: 'Too many lookups. Please wait a minute and try again.' },
      { ...corsHeaders(request), 'retry-after': String(limit.retryAfter || 60) });
  }

  const body = await readJson(request);
  if (!body.ok) {
    return json(400, { error: body.reason, message: 'That request could not be read.' }, corsHeaders(request));
  }

  const input = await validateStatusInput(body.value);
  if (!input.ok) {
    return json(400, { error: input.reason, message: 'Please enter a reference number and a phone number.' },
      corsHeaders(request));
  }

  let persona;
  try {
    persona = await loadPersona(input.persona);
  } catch (_) {
    logRequest({ status: 500, reason: 'persona_load_failed', ms: Date.now() - started });
    return json(500, { error: 'misconfigured', message: 'Something went wrong on our side.' },
      corsHeaders(request));
  }

  const result = findRecord(persona.demoData, input.reference, input.phone);

  if (!result.found) {
    // Identical status code and identical wording for an unknown reference and
    // for a real reference with the wrong phone. Do not differentiate.
    logRequest({ persona: persona.key, status: 404, reason: 'not_found', ms: Date.now() - started });
    return json(404, { found: false, text: notFoundText(persona.config) }, corsHeaders(request));
  }

  const built = buildStatusReply(result.record, persona.config);
  const url = waLink(persona.config, buildHandoffText(persona.config, 'Checking ' + result.record.reference, result.record.reference));

  logRequest({ persona: persona.key, status: 200, reason: 'found', ms: Date.now() - started });

  return json(200, {
    found: true,
    text: built.text,
    record: {
      reference: result.record.reference,
      summary: result.record.summary,
      status: result.record.status,
      statusLabel: (persona.config.statuses[result.record.status] || {}).label || result.record.status,
      explanation: (persona.config.statuses[result.record.status] || {}).explanation || '',
      eta: result.record.eta,
      updatedAt: result.record.updatedAt,
    },
    handoff: url ? { url } : null,
  }, corsHeaders(request));
};
