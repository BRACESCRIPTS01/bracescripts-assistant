// Removes digit runs before any model call, so phone numbers never reach a model.
// Called by channels and by validate.mjs on the message and every history turn.

const DIGIT_RUN = /\d{7,}/g;

export function redactDigits(text) {
  if (typeof text !== 'string') return '';
  return text.replace(DIGIT_RUN, '[number removed]');
}

export function containsDigitRun(text) {
  if (typeof text !== 'string') return false;
  DIGIT_RUN.lastIndex = 0;
  return DIGIT_RUN.test(text);
}
