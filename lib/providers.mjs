// Calls the language model: Gemini first, Groq if Gemini fails.
// The API keys are read from the environment here and nowhere else.
// Called by Netlify/functions/chat.mjs.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 8000;

// Both providers are forced to this shape. All fields required, no nulls:
// Groq strict mode requires it, and a plain string for reference avoids a
// nullable union I could not verify against either provider.
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Plain text answer, no markdown, 80 words maximum.' },
    intent: { type: 'string', enum: ['answer', 'track', 'handoff', 'refuse'] },
    reference: { type: 'string', description: 'Reference the visitor typed, or an empty string.' },
  },
  required: ['reply', 'intent', 'reference'],
  additionalProperties: false,
};

function timeoutSignal(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, clear: () => clearTimeout(t) };
}

// Plain-text transcript instead of a structured turn array. It is one string on
// both providers, so there is no second API shape to get wrong.
function transcript(history, message) {
  if (!history || history.length === 0) return message;
  const lines = ['Conversation so far:'];
  for (const turn of history) {
    lines.push((turn.role === 'assistant' ? 'Assistant: ' : 'Visitor: ') + turn.content);
  }
  lines.push('', 'Visitor: ' + message);
  return lines.join('\n');
}

export async function callGemini({ systemPrompt, history, message, model }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: t.signal,
      body: JSON.stringify({
        model: model || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        system_instruction: systemPrompt,
        input: transcript(history, message),
        store: false,
        response_format: { type: 'text', mime_type: 'application/json', schema: REPLY_SCHEMA },
        generation_config: { max_output_tokens: 400, thinking_level: 'minimal' },
      }),
    });

    if (!res.ok) {
      return { ok: false, reason: res.status === 429 ? 'busy' : 'http_' + res.status };
    }
    const body = await res.json();
    const steps = Array.isArray(body.steps) ? body.steps : [];
    const parts = [];
    for (const step of steps) {
      if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
      for (const block of step.content) {
        if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
      }
    }
    if (parts.length === 0) return { ok: false, reason: 'empty_response' };
    return { ok: true, provider: 'gemini', raw: parts.join('') };
  } catch (err) {
    return { ok: false, reason: err && err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    t.clear();
  }
}

export async function callGroq({ systemPrompt, history, message, model }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      signal: t.signal,
      body: JSON.stringify({
        model: model || process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript(history, message) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'assistant_reply', strict: true, schema: REPLY_SCHEMA },
        },
        max_completion_tokens: 400,
      }),
    });

    if (!res.ok) {
      return { ok: false, reason: res.status === 429 ? 'busy' : 'http_' + res.status };
    }
    const body = await res.json();
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text) return { ok: false, reason: 'empty_response' };
    return { ok: true, provider: 'groq', raw: text };
  } catch (err) {
    return { ok: false, reason: err && err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    t.clear();
  }
}

const CALLERS = { gemini: callGemini, groq: callGroq };

// Tries the primary, then the fallback. Returns the first success.
export async function callModel({ systemPrompt, history, message }) {
  const primary = (process.env.PRIMARY_PROVIDER || 'gemini').toLowerCase();
  const fallback = (process.env.FALLBACK_PROVIDER || 'groq').toLowerCase();

  const order = [primary, fallback].filter((p, i, arr) => CALLERS[p] && arr.indexOf(p) === i);
  if (order.length === 0) return { ok: false, reason: 'no_provider_configured' };

  const tried = [];
  for (const name of order) {
    const result = await CALLERS[name]({ systemPrompt, history, message });
    if (result.ok) return { ...result, tried };
    tried.push({ provider: name, reason: result.reason });
  }

  // Every provider was rate limited -> busy. Anything else -> unavailable.
  const allBusy = tried.every((t) => t.reason === 'busy');
  return { ok: false, reason: allBusy ? 'busy' : 'unavailable', tried };
}
