// HTTP helpers: JSON responses, CORS, the origin check, and a small in-memory
// rate limiter. Called by both Netlify functions.

const BODY_CAP_BYTES = 8 * 1024;

export function json(status, payload, extra) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...(extra || {}),
    },
  });
}

export function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Same-origin (Origin host equals Host) or an exact allow-list match.
// A missing Origin is refused: browsers always send it on a cross-site POST.
export function originAllowed(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return false;

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch (_) {
    return false;
  }
  if (!originHost) return false;

  if (allowedOrigins().includes(origin)) return true;

  const host = request.headers.get('host') || '';
  if (!host) return false;
  return host.toLowerCase() === originHost.toLowerCase();
}

export function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = allowedOrigins().includes(origin);
  return allowed
    ? { 'access-control-allow-origin': origin, vary: 'origin' }
    : { vary: 'origin' };
}

export function preflight(request) {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins().includes(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
      vary: 'origin',
    },
  });
}

// Reads JSON with a hard size cap, so a huge body cannot be parsed.
export async function readJson(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > BODY_CAP_BYTES) {
    return { ok: false, reason: 'body_too_large' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (_) {
    return { ok: false, reason: 'bad_json' };
  }
}

// ---------------------------------------------------------------------------
// Rate limiting.
//
// HONEST LIMIT: this is per-instance and in memory. It resets on cold start and
// each warm instance keeps its own count, so the real ceiling is roughly
// limit x instances. Netlify's own rate limit (set in each function's config)
// is the primary control; this closes its 10-second enforcement gap.
// It stops one abusive client. It does not stop a distributed attack.
// ---------------------------------------------------------------------------
const buckets = new Map();

export function takeToken(key, perWindow) {
  const limit = Number(process.env.RATE_LIMIT_WINDOW_LIMIT || perWindow || 10);
  const windowMs = 60_000;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now - entry.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return { allowed: true };
  }
  if (entry.count >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - entry.start)) / 1000);
    return { allowed: false, retryAfter };
  }
  entry.count += 1;
  return { allowed: true };
}

export function clientKey(request) {
  const ip = request.headers.get('x-nf-client-connection-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return ip || 'unknown';
}

export function resetRateLimits() {
  buckets.clear();
}
