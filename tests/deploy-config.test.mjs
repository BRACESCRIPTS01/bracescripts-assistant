// Guards the two things that have already gone wrong once: a file that should
// never be public being served, and a page shipped without security headers.
// Runs offline against netlify.toml and _headers. No network.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const toml = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

// Minimal read of the [[redirects]] blocks. A full TOML parser is not worth a
// dependency for four keys.
// Note: the FIRST split fragment is whatever text preceded the first
// [[redirects]] header. It is the file's opening comment block, which mentions
// the word "redirects" - so it must be dropped, not parsed.
function redirects(text) {
  const blocks = text.split('\n[[redirects]]\n').slice(1);
  return blocks.filter((b) => /from\s*=/.test(b)).map((b) => {
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
    '/.netlify/*',
  ];
  for (const path of mustHide) {
    const rule = rules.find((r) => r.from === path);
    assert.ok(rule, 'no redirect rule for ' + path);
    assert.equal(rule.status, 404, path + ' must return 404');
    assert.equal(rule.force, true, path + ' must use force, or the real file wins');
  }
});

// Netlify accepts a splat only at the end of a path. A rule like "/*.md" is
// silently ignored — it was written on 2026-11-12 and the files stayed public.
// So every markdown file at the root needs its own rule, and this test is what
// stops the list going stale when someone adds a document.
test('every markdown file at the repo root has its own deny rule', async () => {
  const root = new URL('../', import.meta.url);
  const entries = await readdir(root);
  const markdown = entries.filter((f) => f.endsWith('.md'));

  assert.ok(markdown.length > 0, 'sanity: there are markdown files at the root');

  for (const file of markdown) {
    const rule = rules.find((r) => r.from === '/' + file);
    assert.ok(rule, file + ' is public and has no deny rule in netlify.toml');
    assert.equal(rule.status, 404, file + ' must return 404');
    assert.equal(rule.force, true, file + ' needs force = true');
  }
});

test('no redirect rule relies on a mid-path splat, which Netlify ignores', () => {
  for (const rule of rules) {
    assert.ok(rule.from, 'every redirect needs a from');
    const splat = rule.from.indexOf('*');
    const lastChar = rule.from.length - 1;
    assert.ok(
      splat === -1 || splat === lastChar,
      rule.from + ' has a splat that is not at the end, so Netlify will not match it',
    );
  }
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
