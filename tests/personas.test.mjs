// Tests for lib/personas.mjs: the allowlist, the shape check, the facts cap.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPersona, isAllowedPersona, clearPersonaCache } from '../lib/personas.mjs';

test('the allowlist is exactly three keys', () => {
  assert.equal(isAllowedPersona('exchange'), true);
  assert.equal(isAllowedPersona('food'), true);
  assert.equal(isAllowedPersona('cleaning'), true);
  for (const bad of ['admin', 'FOOD', '', '../food', 'food/../food', null, undefined, 42]) {
    assert.equal(isAllowedPersona(bad), false, String(bad));
  }
});

test('an unknown persona is refused, not loaded', async () => {
  await assert.rejects(() => loadPersona('admin'), (err) => err.code === 'UNKNOWN_PERSONA');
});

test('a path traversal attempt is refused', async () => {
  await assert.rejects(() => loadPersona('../lib/validate'), (err) => err.code === 'UNKNOWN_PERSONA');
});

for (const key of ['exchange', 'food', 'cleaning']) {
  test('persona ' + key + ' loads with valid config and facts', async () => {
    clearPersonaCache();
    const p = await loadPersona(key);
    assert.equal(p.config.key, key);
    assert.ok(p.facts.length > 100, 'facts should not be empty');
    assert.ok(p.facts.length <= 4000, 'facts must fit the cap');
    assert.ok(Array.isArray(p.demoData));
    assert.equal(p.demoData.length, 6, key + ' should ship 6 demo records');
  });

  test('persona ' + key + ' demo records use statuses the config defines', async () => {
    const p = await loadPersona(key);
    for (const record of p.demoData) {
      assert.ok(p.config.statuses[record.status],
        key + ' record ' + record.reference + ' has undefined status ' + record.status);
    }
  });

  test('persona ' + key + ' demo references match its own referencePattern', async () => {
    const p = await loadPersona(key);
    const re = new RegExp(p.config.referencePattern);
    for (const record of p.demoData) {
      assert.ok(re.test(record.reference), record.reference + ' does not match ' + p.config.referencePattern);
    }
  });

  test('persona ' + key + ' demo phones are obviously fake', async () => {
    const p = await loadPersona(key);
    for (const record of p.demoData) {
      assert.ok(record.phone.startsWith('0999'), record.phone + ' is not in the unallocated range');
    }
  });
}

test('every persona has at least one record with an ETA and one without', async () => {
  for (const key of ['exchange', 'food', 'cleaning']) {
    const p = await loadPersona(key);
    assert.ok(p.demoData.some((r) => r.etaOffsetMinutes !== undefined), key + ' needs a record with an ETA');
    assert.ok(p.demoData.some((r) => r.etaOffsetMinutes === undefined), key + ' needs a record without an ETA');
  }
});

test('a placeholder WhatsApp number is flagged, never treated as real', async () => {
  clearPersonaCache();
  const p = await loadPersona('food');
  assert.equal(p.config.whatsappIsPlaceholder, true, 'the shipped sentinel must be flagged');
});

test('the identity rule holds: no two personas share a reference', async () => {
  const seen = new Set();
  for (const key of ['exchange', 'food', 'cleaning']) {
    const p = await loadPersona(key);
    for (const record of p.demoData) {
      assert.ok(!seen.has(record.reference), 'duplicate reference ' + record.reference);
      seen.add(record.reference);
    }
  }
});

test('facts too long is refused with a clear error, not truncated silently', async () => {
  clearPersonaCache();
  process.env.FACTS_MAX_CHARS = '10';
  await assert.rejects(
    () => loadPersona('food'),
    (err) => err.code === 'FACTS_TOO_LONG' && /FACTS_MAX_CHARS/.test(err.message)
  );
  delete process.env.FACTS_MAX_CHARS;
  clearPersonaCache();
});
