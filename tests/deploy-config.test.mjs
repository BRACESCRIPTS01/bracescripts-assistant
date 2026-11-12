// Guards the two things that have already gone wrong once: a file that should
// never be public being served, and a page shipped without security headers.
// Runs offline against netlify.toml and _headers. No network.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const toml = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

// Minimal read of the [[redirects]] blocks. A full TOML parser is not worth a
// dependency for four keys.
function redirects(text) {
  const blocks = text.split('[[redirects]]').slice(1);
  return blocks.map((b) => {
    const from = b.match(/from\s*=\s*"([^"]+)"/);
    const status = b.match(/status\s*=\s*(\d+)/);
    const force = /force\s*=\s*true/.test(b);
    return { from: from && from[1], status: status ? Number(status[1]) : null, force };
  });
}

const rules = redirects(toml);

test('every path that must not be public is forced to a 404', () => {
  const mustHide = [
    '/lib/*', '/tests/*', '/docs/*', '/business/*',
    '/netlify.toml', '/package.json', '/README.md', '/_headers',
    '/*.md', '/.netlify/*',
  ];
  for (const path of mustHide) {
    const rule = rules.find((r) => r.from === path);
    assert.ok(rule, 'no redirect rule for ' + path);
    assert.equal(rule.status, 404, path + ' must return 404');
    assert.equal(rule.force, true, path + ' must use force, or the real file wins');
  }
});

test('a markdown file at the root is caught by the *.md rule, not by its own name', () => {
  // STEP-1-PLAN.md and ARCHITECTURE-V2-WHATSAPP.md were public on a real deploy.
  // Naming them one by one would miss the next file someone adds.
  const md = rules.find((r) => r.from === '/*.md');
  assert.ok(md, 'the catch-all markdown rule is the actual protection');
});

test('the function alias cannot bypass the rate limit', () => {
  const alias = rules.find((r) => r.from === '/.netlify/*');
  assert.ok(alias, 'alias must be denied');
  assert.equal(alias.force, true);
});

test('security headers apply to every path', () => {
  assert.match(headers, /^\/\*/m, 'the /* block must come first');
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)[1];
  assert.ok(!/unsafe-inline/.test(csp), 'no inline script or style allowances');
  assert.ok(!/unsafe-eval/.test(csp), 'no eval');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Referrer-Policy:/);
  assert.match(headers, /Permissions-Policy:/);
});

test('publish stays at the repo root, so the deny rules are what protect it', () => {
  assert.match(toml, /publish\s*=\s*"\."/, 'index.html is at the root by design');
  assert.match(toml, /included_files\s*=\s*\["business\/\*\*"\]/, 'functions read business/ at runtime');
});
