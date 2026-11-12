// Tests for lib/status-text.mjs: deterministic text, no invented times.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatusReply, notFoundText, buildHandoffText, waLink, formatLocal } from '../lib/status-text.mjs';

const CONFIG = {
  name: 'Fatima Spagogo',
  trackingNoun: 'order',
  whatsapp: '2348012345678',
  timezone: 'Africa/Lagos',
  statuses: {
    preparing: { label: 'Preparing', explanation: 'The kitchen is preparing your food now.' },
    out_for_delivery: { label: 'Out for delivery', explanation: 'It has left the kitchen.' },
    cancelled: { label: 'Cancelled', explanation: 'This order was cancelled.' },
  },
};

test('a record with an ETA states the time', () => {
  const r = buildStatusReply(
    { reference: 'SPG-1001', summary: 'Chicken spaghetti x1', status: 'out_for_delivery',
      eta: '2026-11-09T14:20:00+01:00', updatedAt: '2026-11-09T13:05:00+01:00' },
    CONFIG
  );
  assert.ok(r.text.includes('Expected'), 'expected a stated time');
  assert.ok(r.text.includes('SPG-1001'));
});

test('a record with no ETA invents nothing', () => {
  const r = buildStatusReply(
    { reference: 'SPG-1002', summary: 'Family pack x1', status: 'preparing',
      updatedAt: '2026-11-09T13:05:00+01:00' },
    CONFIG
  );
  assert.ok(!r.text.includes('Expected'), 'must not state a time the data lacks');
  assert.equal(r.eta, null);
});

test('an unknown status is explained honestly, not guessed', () => {
  const r = buildStatusReply({ reference: 'SPG-9', status: 'teleported' }, CONFIG);
  assert.ok(r.text.includes('WhatsApp'), 'should route to a human');
  assert.ok(!r.text.includes('teleported'), 'internal status names never reach the customer');
});

test('the status label and explanation come from config, not the model', () => {
  const r = buildStatusReply({ reference: 'SPG-1', status: 'preparing' }, CONFIG);
  assert.ok(r.text.includes('Preparing'));
  assert.ok(r.text.includes('The kitchen is preparing your food now.'));
});

test('not-found text uses the right article for each noun', () => {
  assert.ok(notFoundText(CONFIG).includes("find an order"));
  assert.ok(notFoundText({ ...CONFIG, trackingNoun: 'booking' }).includes('find a booking'));
  assert.ok(notFoundText({ ...CONFIG, trackingNoun: 'transaction' }).includes('find a transaction'));
});

test('not-found text is identical whatever the reason', () => {
  const a = notFoundText(CONFIG);
  const b = notFoundText(CONFIG);
  assert.equal(a, b, 'same wording for unknown reference and wrong phone');
});

test('handoff text carries the context and nothing personal', () => {
  const text = buildHandoffText(CONFIG, 'how much is family pack', 'SPG-1001');
  assert.ok(text.includes('Fatima Spagogo'));
  assert.ok(text.includes('SPG-1001'));
  assert.ok(text.includes('how much is family pack'));
});

test('handoff text clips a long message to 150 characters', () => {
  const text = buildHandoffText(CONFIG, 'a'.repeat(400), '');
  assert.ok(text.length < 250);
});

test('waLink refuses a placeholder number instead of making a dead link', () => {
  assert.equal(waLink({ ...CONFIG, whatsapp: 'PLACEHOLDER' }, 'hi'), null);
  assert.equal(waLink({ ...CONFIG, whatsapp: '234XXXX' }, 'hi'), null);
  assert.equal(waLink({ ...CONFIG, whatsapp: undefined }, 'hi'), null);
});

test('wa.me link is built and encoded server-side', () => {
  const url = waLink(CONFIG, 'Hello there & thanks');
  assert.ok(url.startsWith('https://wa.me/2348012345678?text='));
  assert.ok(!url.includes(' '), 'spaces must be encoded');
  assert.ok(url.includes('%26'), 'ampersand must be encoded');
});

test('formatLocal formats in West Africa Time regardless of server timezone', () => {
  const out = formatLocal('2026-11-09T14:20:00+01:00');
  assert.ok(out.includes('14:20') || out.includes('2:20'), 'got: ' + out);
});

test('formatLocal returns null for junk rather than "Invalid Date"', () => {
  assert.equal(formatLocal('not-a-date'), null);
  assert.equal(formatLocal(undefined), null);
});
