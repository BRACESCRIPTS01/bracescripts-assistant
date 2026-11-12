// Loads and caches one persona by allowlisted key. Validates shape on read so a
// broken config.json stops the request instead of producing a wrong answer.
// Called by chat.mjs, order-status.mjs and the adapter.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PERSONA_KEYS, TRACKING_NOUNS } from './validate.mjs';
import { limits } from './config.mjs';

const cache = new Map();

// Netlify bundles this file with esbuild, which moves it, so import.meta.url no
// longer sits two levels under the repo root. Nothing guarantees which of these
// locations the bundle sees, so we try each in turn and use the first that
// holds a real config.json. Ordered most-likely first.
function candidateRoots() {
  const here = import.meta.url;
  return [
    new URL('./business/', here),      // bundled: files copied next to the function
    new URL('../../business/', here),  // unbundled local run from lib/
    new URL('../business/', here),
    new URL('./', here),
  ];
}

async function findPersonaRoot() {
  for (const base of candidateRoots()) {
    try {
      await readFile(new URL('food/config.json', base), 'utf8');
      return base;
    } catch (_) {
      // try the next candidate
    }
  }
  const err = new Error('business/ directory not found from any candidate root');
  err.code = 'NO_BUSINESS_DIR';
  throw err;
}

export function isAllowedPersona(key) {
  return PERSONA_KEYS.includes(key);
}

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

function assertShape(config, key) {
  const errors = [];
  if (config.key !== key) errors.push('key does not match folder');
  if (!TRACKING_NOUNS.includes(config.trackingNoun)) errors.push('bad trackingNoun');
  const isPlaceholder = config.whatsapp === 'PLACEHOLDER';
  if (!isPlaceholder && (typeof config.whatsapp !== 'string' || !/^\d{10,15}$/.test(config.whatsapp))) {
    errors.push('whatsapp must be digits only (10-15) or the literal PLACEHOLDER');
  }
  if (typeof config.referencePattern !== 'string') {
    errors.push('referencePattern missing');
  } else {
    try {
      new RegExp(config.referencePattern);
    } catch (_) {
      errors.push('referencePattern does not compile');
    }
  }
  if (!config.statuses || typeof config.statuses !== 'object') errors.push('statuses missing');
  if (!Array.isArray(config.refusals)) errors.push('refusals must be an array');
  if (errors.length) {
    const err = new Error('persona ' + key + ' invalid: ' + errors.join('; '));
    err.code = 'BAD_PERSONA';
    throw err;
  }
}

export async function loadPersona(key) {
  if (!isAllowedPersona(key)) {
    const err = new Error('persona not allowlisted');
    err.code = 'UNKNOWN_PERSONA';
    throw err;
  }
  if (cache.has(key)) return cache.get(key);

  const root = await findPersonaRoot();
  const dir = new URL(key + '/', root);
  const config = await readJson(new URL('config.json', dir));
  assertShape(config, key);

  const facts = await readFile(new URL('facts.md', dir), 'utf8');
  const cap = limits();
  if (facts.length > cap.factsMaxChars) {
    const err = new Error('facts.md for ' + key + ' is ' + facts.length
      + ' chars, cap is ' + cap.factsMaxChars + ' (raise FACTS_MAX_CHARS or shorten the file)');
    err.code = 'FACTS_TOO_LONG';
    throw err;
  }

  let demoData = [];
  try {
    demoData = await readJson(new URL('demo-data.json', dir));
  } catch (_) {
    demoData = [];
  }

  // A placeholder must never silently become a broken wa.me link.
  config.whatsappIsPlaceholder = config.whatsapp === 'PLACEHOLDER';

  const persona = { key, config, facts, demoData };
  cache.set(key, persona);
  return persona;
}

export function clearPersonaCache() {
  cache.clear();
}

export async function personaRoot() {
  const root = await findPersonaRoot();
  return join(new URL(root).pathname);
}
