// Demo data adapter. Reads business/<persona>/demo-data.json in memory.
// A real client gets a new file with the same signature: findRecord(persona, reference, phoneCanonical).
// Called by Netlify/functions/order-status.mjs. No model is involved here.

// Demo records use 0999 000 0001..0006, an unallocated range. Those are NOT
// valid Nigerian mobile numbers, so normalisePhone() returns null for them.
// The demo adapter therefore compares digits-only, while a real adapter must
// use normalisePhone() on live customer numbers. The rule that matters is
// unchanged: the record's phone and the caller's phone must match exactly.
function digitsOnly(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\d]/g, '');
}

// Demo records store offsets from "now" so the demo never looks stale.
// A real adapter returns absolute timestamps instead.
function resolveOffset(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

// Returns the safe subset, or null. Never returns a phone, address, email or name.
function shape(record) {
  return {
    reference: record.reference,
    summary: record.summary || '',
    status: record.status,
    eta: record.eta || resolveOffset(record.etaOffsetMinutes),
    updatedAt: record.updatedAt || resolveOffset(record.updatedAtOffsetMinutes),
  };
}

/**
 * @returns {{found:true, record:object} | {found:false}}
 * Not-found and phone-mismatch return the identical result, by design, so a
 * stranger cannot tell a real reference from a fake one.
 */
export function findRecord(personaData, reference, phoneRaw) {
  const phoneCanonical = digitsOnly(phoneRaw);
  if (phoneCanonical.length < 7) return { found: false };

  const ref = typeof reference === 'string' ? reference.trim().toUpperCase() : '';
  if (!ref) return { found: false };

  const list = Array.isArray(personaData) ? personaData : [];
  const record = list.find((r) => String(r.reference).toUpperCase() === ref);
  if (!record) return { found: false };

  const recordPhone = digitsOnly(record.phone);
  if (!recordPhone || recordPhone !== phoneCanonical) return { found: false };

  return { found: true, record: shape(record) };
}
