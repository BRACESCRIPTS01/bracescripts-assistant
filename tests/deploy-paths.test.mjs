// Guards the deploy-time failure we actually hit on 2026-11-12: after Netlify
// bundles the function, the relative path to business/ was wrong, and the
// endpoint returned 500 "misconfigured" on every request.
//
// The unit test could not have caught it, because the tests run unbundled.
// What this asserts is the contract the fix depends on: whatever the bundle
// layout, at least one candidate root resolves, and it is inside the repo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPersona, clearPersonaCache } from '../lib/personas.mjs';

test('repository layout: business/ exists at the repo root, next to lib/', () => {
  const repoRoot = new URL('../', import.meta.url);
  assert.ok(existsSync(new URL('business/food/config.json', repoRoot)),
    'business/ must sit beside lib/ for the unbundled candidate to work');
  assert.ok(existsSync(new URL('lib/personas.mjs', repoRoot)));
});

test('every persona directory has all three files', async () => {
  const root = new URL('../business/', import.meta.url);
  for (const key of ['exchange', 'food', 'cleaning']) {
    for (const file of ['config.json', 'facts.md', 'demo-data.json']) {
      const text = await readFile(new URL(key + '/' + file, root), 'utf8');
      assert.ok(text.length > 0, key + '/' + file + ' is empty');
    }
  }
});

test('persona loading works regardless of which candidate root wins', async () => {
  clearPersonaCache();
  const p = await loadPersona('food');
  assert.equal(p.config.key, 'food');
  assert.ok(p.facts.includes('Chicken spaghetti'));
  assert.ok(fileURLToPath(import.meta.url).includes('tests'));
});

test('a persona that does not exist on disk fails with UNKNOWN_PERSONA, not a path error', async () => {
  await assert.rejects(() => loadPersona('nonexistent'), (err) => err.code === 'UNKNOWN_PERSONA');
});
