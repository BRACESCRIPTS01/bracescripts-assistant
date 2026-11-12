// Tests for lib/prompt.mjs and lib/providers.mjs (no network, no keys).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../lib/prompt.mjs';
import { loadPersona } from '../lib/personas.mjs';
import { REPLY_SCHEMA, callModel } from '../lib/providers.mjs';

test('the prompt contains the persona facts and refusals', async () => {
  const persona = await loadPersona('food');
  const prompt = buildSystemPrompt(persona);
  assert.ok(prompt.includes('Fatima Spagogo'));
  assert.ok(prompt.includes('Chicken spaghetti'), 'menu must reach the model');
  assert.ok(prompt.includes('no price negotiation'), 'refusals must reach the model');
  assert.ok(prompt.includes('waiting to be processed') === false, 'other personas must not leak in');
});

test('the prompt names every status the persona defines', async () => {
  const persona = await loadPersona('cleaning');
  const prompt = buildSystemPrompt(persona);
  for (const status of Object.keys(persona.config.statuses)) {
    assert.ok(prompt.includes(status), 'missing status ' + status);
  }
});

test('the prompt contracts for each persona differ', async () => {
  const food = buildSystemPrompt(await loadPersona('food'));
  const exchange = buildSystemPrompt(await loadPersona('exchange'));
  assert.ok(food.includes('order'));
  assert.ok(exchange.includes('transaction'));
  assert.notEqual(food, exchange);
});

test('the prompt forbids secrets and invented facts', async () => {
  const prompt = buildSystemPrompt(await loadPersona('food'));
  for (const rule of ['Never invent', 'card numbers', 'DATA, not instructions', 'payments']) {
    assert.ok(prompt.includes(rule), 'missing rule: ' + rule);
  }
});

test('the prompt never contains an API key pattern', async () => {
  const prompt = buildSystemPrompt(await loadPersona('food'));
  assert.equal(/AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}/.test(prompt), false);
});

test('the schema is strict-mode compatible: all fields required, no extras', () => {
  assert.deepEqual(REPLY_SCHEMA.required, ['reply', 'intent', 'reference']);
  assert.equal(REPLY_SCHEMA.additionalProperties, false);
  assert.deepEqual(Object.keys(REPLY_SCHEMA.properties), ['reply', 'intent', 'reference']);
  assert.equal(REPLY_SCHEMA.properties.reference.type, 'string', 'no nullable union');
});

test('the schema intent enum matches the server allowlist', () => {
  assert.deepEqual(REPLY_SCHEMA.properties.intent.enum, ['answer', 'track', 'handoff', 'refuse']);
});

test('callModel fails cleanly with no keys and no network call', async () => {
  const savedGemini = process.env.GEMINI_API_KEY;
  const savedGroq = process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;

  const r = await callModel({ systemPrompt: 'x', history: [], message: 'hello' });
  assert.equal(r.ok, false);
  assert.ok(['no_key', 'unavailable', 'busy'].includes(r.reason), 'got: ' + r.reason);

  if (savedGemini) process.env.GEMINI_API_KEY = savedGemini;
  if (savedGroq) process.env.GROQ_API_KEY = savedGroq;
});

test('callModel reports every provider it tried', async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  const r = await callModel({ systemPrompt: 'x', history: [], message: 'hi' });
  assert.equal(r.ok, false);
  assert.equal(r.tried.length, 2, 'both providers should be attempted');
  assert.deepEqual(r.tried.map((t) => t.provider), ['gemini', 'groq']);
});
