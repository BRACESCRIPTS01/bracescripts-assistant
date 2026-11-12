// Deterministic status replies. No model is involved and no time is invented.
// Called by order-status.mjs after the data adapter returns a record.

import { articleFor } from './validate.mjs';

const TIME_ZONE = 'Africa/Lagos';

export function formatLocal(iso, timeZone = TIME_ZONE) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function buildStatusReply(record, config) {
  const label = config.statuses[record.status];
  if (!label) {
    return {
      text: 'We have your ' + config.trackingNoun + ' on record, but its status is not one we can explain here. '
        + 'Please message us on WhatsApp and a person will look at it.',
      eta: null,
    };
  }

  const parts = [];
  parts.push(config.trackingNoun.charAt(0).toUpperCase() + config.trackingNoun.slice(1)
    + ' ' + record.reference + ' — ' + label.label + '.');
  if (record.summary) parts.push(record.summary + '.');
  parts.push(label.explanation);

  // The only place a time enters the reply: when the data actually carries one.
  if (record.eta) {
    const when = formatLocal(record.eta, config.timezone || TIME_ZONE);
    if (when) parts.push('Expected ' + when + '.');
  }

  if (record.updatedAt) {
    const seen = formatLocal(record.updatedAt, config.timezone || TIME_ZONE);
    if (seen) parts.push('Last updated ' + seen + '.');
  }

  return { text: parts.join(' '), eta: record.eta || null };
}

export function notFoundText(config) {
  const noun = config.trackingNoun;
  return 'We couldn\'t find ' + articleFor(noun) + ' ' + noun
    + ' with that reference and phone number. Please check both and try again, '
    + 'or message us on WhatsApp.';
}

export function buildHandoffText(config, message, reference) {
  const clipped = typeof message === 'string' ? message.slice(0, 150) : '';
  const lines = ['Hi ' + config.name + ', I was on your website.'];
  if (reference) lines.push('Reference: ' + reference);
  if (clipped) lines.push('I asked: ' + clipped);
  return lines.join('\n');
}

// Returns null when no real number is configured, so callers must show an
// honest "not configured yet" message instead of a dead link.
export function waLink(config, text) {
  if (!config || config.whatsapp === 'PLACEHOLDER' || !/^\d{10,15}$/.test(config.whatsapp || '')) {
    return null;
  }
  return 'https://wa.me/' + config.whatsapp + '?text=' + encodeURIComponent(text);
}
