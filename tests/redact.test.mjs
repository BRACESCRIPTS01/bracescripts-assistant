// Tests for lib/redact.mjs. A phone number must never reach a model.

import test from 'node:test';
import assert from 'node:assert/strict';
import { redactDigits, containsDigitRun } from '../lib/redact.mjs';

test('redactDigits: removes a Nigerian mobile number', () => {
  assert.equal(redactDigits('my number is 08031234567'), 'my number is [number removed]');
});

test('redactDigits: removes an international number', () => {
  assert.equal(redactDigits('call 2348031234567 tomorrow'), 'call [number removed] tomorrow');
});

test('redactDigits: removes every run, not only the first', () => {
  const out = redactDigits('08031234567 and 09031234568');
  assert.equal(out.split('[number removed]').length - 1, 2);
});

test('redactDigits: leaves short numbers alone', () => {
  assert.equal(redactDigits('I want 2 plates'), 'I want 2 plates');
  assert.equal(redactDigits('order 123456'), 'order 123456', 'six digits is a price, not a phone');
});

test('redactDigits: a reference with a 7+ digit run loses that run', () => {
  const out = redactDigits('reference SPG-1234567');
  assert.ok(!out.includes('1234567'));
});

test('redactDigits: non-strings return an empty string, never throw', () => {
  for (const v of [null, undefined, 42, {}]) assert.equal(redactDigits(v), '');
});

test('containsDigitRun detects what redactDigits would change', () => {
  assert.equal(containsDigitRun('08031234567'), true);
  assert.equal(containsDigitRun('I want 2 plates'), false);
});
