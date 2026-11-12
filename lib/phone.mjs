// Phone normalisation for Nigerian numbers. Pure functions, no I/O.
// Called by validate.mjs and the demo adapter before any comparison.

const NG_MOBILE = /^(?:0[789][01]\d{8}|[789][01]\d{8})$/;

export function normalisePhone(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;

  let local = digits;
  if (local.startsWith('234')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);

  if (!/^[789][01]\d{8}$/.test(local)) return null;
  return '234' + local;
}

export function isValidNgPhone(raw) {
  return normalisePhone(raw) !== null;
}

export function formatPhoneDisplay(canonical) {
  if (typeof canonical !== 'string' || !canonical.startsWith('234')) return '';
  const local = '0' + canonical.slice(3);
  return local.slice(0, 4) + ' ' + local.slice(4, 7) + ' ' + local.slice(7);
}
