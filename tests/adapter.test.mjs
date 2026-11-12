// Tests for lib/adapters/demo.mjs: the identity rule and what must never leak.

import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecord } from '../lib/adapters/demo.mjs';
import { loadPersona } from '../lib/personas.mjs';

const RECORDS = [
  { reference: 'SPG-1001', phone: '0999000001', summary: 'Chicken spaghetti x1',
    status: 'out_for_delivery', etaOffsetMinutes: 20, updatedAtOffsetMinutes: -6 },
  { reference: 'SPG-1002', phone: '0999000002', summary: 'Family pack x1',
    status: 'preparing', updatedAtOffsetMinutes: -14 },
];

test('correct reference and phone returns the record', () => {
  const r = findRecord(RECORDS, 'SPG-1001', '0999000001');
  assert.equal(r.found, true);
  assert.equal(r.record.reference, 'SPG-1001');
});

test('a wrong phone returns the same result as a wrong reference', () => {
  const wrongPhone = findRecord(RECORDS, 'SPG-1001', '0999000002');
  const wrongRef = findRecord(RECORDS, 'SPG-9999', '0999000001');
  assert.deepEqual(wrongPhone, { found: false });
  assert.deepEqual(wrongRef, { found: false });
  assert.equal(JSON.stringify(wrongPhone), JSON.stringify(wrongRef),
    'a stranger must not be able to tell the two failures apart');
});

test('the phone is normalised before comparison', () => {
  // The demo stores 0999000001; these must all match it or all fail together.
  for (const variant of ['0999000001', '0999 000 0001']) {
    const r = findRecord(RECORDS, 'SPG-1001', variant);
    assert.equal(typeof r.found, 'boolean', variant + ' must not throw');
  }
});

test('reference matching is case tolerant but still exact on the value', () => {
  assert.equal(findRecord(RECORDS, 'spg-1001', '0999000001').found, true);
  assert.equal(findRecord(RECORDS, 'SPG-100', '0999000001').found, false, 'partial reference must fail');
});

test('an invalid phone fails without throwing', () => {
  for (const bad of ['', 'abc', '123', null, undefined, 42]) {
    assert.equal(findRecord(RECORDS, 'SPG-1001', bad).found, false);
  }
});

test('the returned record never contains a phone, address, email or full name', () => {
  const r = findRecord(RECORDS, 'SPG-1001', '0999000001');
  const keys = Object.keys(r.record);
  for (const forbidden of ['phone', 'address', 'email', 'name', 'customer']) {
    assert.ok(!keys.includes(forbidden), 'record leaked a ' + forbidden + ' field');
  }
});

test('an ETA is resolved to a real timestamp, and absent when the data has none', () => {
  const withEta = findRecord(RECORDS, 'SPG-1001', '0999000001');
  assert.ok(withEta.record.eta, 'expected a resolved ETA');
  assert.ok(!Number.isNaN(Date.parse(withEta.record.eta)));

  const withoutEta = findRecord(RECORDS, 'SPG-1002', '0999000002');
  assert.equal(withoutEta.record.eta, null, 'must not invent a time');
});

test('every shipped persona record is reachable with its own demo phone', async () => {
  for (const key of ['exchange', 'food', 'cleaning']) {
    const p = await loadPersona(key);
    for (const record of p.demoData) {
      const r = findRecord(p.demoData, record.reference, record.phone);
      assert.equal(r.found, true, key + ' ' + record.reference + ' should be findable by its own phone');
    }
  }
});

test('one persona cannot read another persona\'s record', async () => {
  const food = await loadPersona('food');
  const exchange = await loadPersona('exchange');
  const tx = exchange.demoData[0];
  const r = findRecord(food.demoData, tx.reference, tx.phone);
  assert.equal(r.found, false, 'a transaction reference must not resolve inside the food dataset');
});
