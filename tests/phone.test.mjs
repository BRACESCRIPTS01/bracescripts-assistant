// Tests for lib/phone.mjs. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePhone, isValidNgPhone, formatPhoneDisplay } from '../lib/phone.mjs';

test('normalisePhone: the three ways a Nigerian number gets written', () => {
  assert.equal(normalisePhone('08031234567'), '2348031234567');
  assert.equal(normalisePhone('+2348031234567'), '2348031234567');
  assert.equal(normalisePhone('2348031234567'), '2348031234567');
});

test('normalisePhone: spaces, dashes and brackets are ignored', () => {
  assert.equal(normalisePhone('0803 123 4567'), '2348031234567');
  assert.equal(normalisePhone('0803-123-4567'), '2348031234567');
  assert.equal(normalisePhone('(0803) 123 4567'), '2348031234567');
});

test('normalisePhone: all four Nigerian mobile prefixes are accepted', () => {
  for (const n of ['08031234567', '09031234567', '07031234567', '08131234567']) {
    assert.equal(normalisePhone(n), '234' + n.slice(1), n + ' should normalise');
  }
});

test('normalisePhone: wrong length and wrong prefix are refused, not fixed', () => {
  assert.equal(normalisePhone('0803123456'), null, 'too short');
  assert.equal(normalisePhone('080312345678'), null, 'too long');
  assert.equal(normalisePhone('05031234567'), null, '050 is not a mobile prefix');
  assert.equal(normalisePhone('01031234567'), null, '010 is not a mobile prefix');
  assert.equal(normalisePhone('12345'), null);
});

test('normalisePhone: non-strings and empty input return null, never throw', () => {
  for (const v of [null, undefined, 42, {}, [], '', '   ']) {
    assert.equal(normalisePhone(v), null);
  }
});

test('two different ways of writing the same number compare equal', () => {
  assert.equal(normalisePhone('0803 123 4567'), normalisePhone('+2348031234567'));
});

test('isValidNgPhone agrees with normalisePhone', () => {
  assert.equal(isValidNgPhone('08031234567'), true);
  assert.equal(isValidNgPhone('05031234567'), false);
  assert.equal(isValidNgPhone('08021234567'), true, '0802 is a real ntel range');
});

test('formatPhoneDisplay is for humans only, never for comparison', () => {
  assert.equal(formatPhoneDisplay('2348031234567'), '0803 123 4567');
  assert.equal(formatPhoneDisplay('nonsense'), '');
});
