// Format check only: a match does NOT mean the PAN was validly issued.
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export function normalizePan(value) {
  return String(value ?? '').trim().toUpperCase()
}

// Applied on every keystroke: uppercase, drop whitespace/symbols, cap at 10 chars.
export function sanitizePanInput(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)
}

export function isValidPanFormat(value) {
  return PAN_REGEX.test(normalizePan(value))
}

export const MAX_BULK_PANS = 50

// Splits pasted text (newlines, commas, semicolons, spaces) into PANs.
// Valid PANs keep their first-seen order; repeats are dropped and counted.
export function parsePanList(text) {
  const valid = []
  const invalid = []
  const seen = new Set()
  let duplicates = 0
  for (const token of String(text ?? '').split(/[\s,;]+/)) {
    const pan = normalizePan(token)
    if (!pan) continue
    if (!PAN_REGEX.test(pan)) invalid.push(pan)
    else if (seen.has(pan)) duplicates += 1
    else {
      seen.add(pan)
      valid.push(pan)
    }
  }
  return { valid, invalid, duplicates }
}

export function getPanValidationMessage(value) {
  const pan = normalizePan(value)
  if (!pan) return 'Please enter your PAN.'
  if (pan.length !== 10) return 'PAN must be exactly 10 characters, e.g. ABCDE1234F.'
  if (!PAN_REGEX.test(pan)) return 'PAN must be 5 letters, then 4 digits, then 1 letter, e.g. ABCDE1234F.'
  return ''
}
