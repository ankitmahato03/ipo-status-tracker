// Field labels for the record keys used by the KFintech response
// (taken from the official ipostatus.kfintech.com frontend). Any other keys the
// API returns are still shown, with a humanized label.
const FIELD_DEFS = {
  Name: { label: 'Applicant name' },
  Appln_No: { label: 'Application no.' },
  Pan_No: { label: 'PAN', mask: true },
  DP_CLID: { label: 'DP ID / Client ID', mask: true },
  category: { label: 'Category' },
  App_Shares: { label: 'Shares applied', numeric: true },
  All_Shares: { label: 'Shares allotted', numeric: true },
}
const FIELD_ORDER = Object.keys(FIELD_DEFS)

// Unknown keys that look like a PAN are masked too.
const SENSITIVE_KEY_PATTERN = /(^|_)pan(_|$)|pan_?no/i

export function hasValue(value) {
  return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')
}

export function maskIdentifier(value, visible = 4) {
  const s = String(value).trim()
  if (s.length <= visible) return 'X'.repeat(s.length)
  return 'X'.repeat(s.length - visible) + s.slice(-visible)
}

export function humanizeKey(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getFieldLabel(key) {
  return FIELD_DEFS[key]?.label ?? humanizeKey(key)
}

export function isNumericField(key) {
  return Boolean(FIELD_DEFS[key]?.numeric)
}

function shouldMask(key) {
  return FIELD_DEFS[key]?.mask ?? SENSITIVE_KEY_PATTERN.test(key)
}

export function formatFieldValue(key, value) {
  if (!hasValue(value)) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value).trim()
  return shouldMask(key) ? maskIdentifier(text) : text
}

// Keys with a value in at least one record: known fields first, then extras A-Z.
export function getColumns(records) {
  const keys = new Set()
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (hasValue(value)) keys.add(key)
    }
  }
  const known = FIELD_ORDER.filter((key) => keys.has(key))
  const extra = [...keys].filter((key) => !FIELD_DEFS[key]).sort()
  return [...known, ...extra]
}

export function getRecordFields(record) {
  return getColumns([record]).map((key) => ({
    key,
    label: getFieldLabel(key),
    value: formatFieldValue(key, record[key]),
  }))
}

// Derived only from an explicit numeric All_Shares value; never guessed.
export function getAllotmentStatus(record) {
  const value = record?.All_Shares
  if (!hasValue(value)) return null
  const shares = Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(shares)) return null
  return shares > 0 ? 'allotted' : 'not_allotted'
}

export const ALLOTMENT_LABELS = {
  allotted: 'Allotted',
  not_allotted: 'Not allotted',
}

function escapeCsvCell(value) {
  let s = String(value ?? '')
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// CSV uses the same masked display values as the UI.
export function recordsToCsv(records, { ipoName = '' } = {}) {
  const columns = getColumns(records)
  const header = ['IPO', ...columns.map(getFieldLabel), 'Allotment status']
  const rows = records.map((record) => [
    ipoName,
    ...columns.map((key) => formatFieldValue(key, record[key])),
    ALLOTMENT_LABELS[getAllotmentStatus(record)] ?? '',
  ])
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

// Bulk results: one entry per PAN ({ pan, status, records, error }), flattened to
// one line per application record. A PAN with no records still gets one line.
export const BULK_STATUS_LABELS = {
  pending: 'Waiting',
  checking: 'Checking',
  no_record: 'No record',
  error: 'Error',
  ...ALLOTMENT_LABELS,
}

export function flattenBulkResults(results) {
  const lines = []
  results.forEach((result, index) => {
    const base = { index: index + 1, pan: result.pan }
    if (result.status === 'done' && result.records.length > 0) {
      for (const record of result.records) lines.push({ ...base, record, status: getAllotmentStatus(record) })
    } else if (result.status === 'done') {
      lines.push({ ...base, record: null, status: 'no_record' })
    } else {
      lines.push({ ...base, record: null, status: result.status, error: result.error })
    }
  })
  return lines
}

export function summarizeBulkResults(results) {
  const counts = { total: results.length, finished: 0, allotted: 0, not_allotted: 0, no_record: 0, error: 0 }
  for (const line of flattenBulkResults(results)) {
    if (line.status in counts) counts[line.status] += 1
  }
  counts.finished = results.filter((r) => r.status === 'done' || r.status === 'error').length
  return counts
}

const BULK_FIELDS = ['Name', 'Appln_No', 'category', 'App_Shares', 'All_Shares']

export function bulkResultsToCsv(results, { ipoName = '' } = {}) {
  const header = ['#', 'IPO', 'PAN', ...BULK_FIELDS.map(getFieldLabel), 'Status', 'Error']
  const rows = flattenBulkResults(results).map((line) => [
    line.index,
    ipoName,
    maskIdentifier(line.pan),
    ...BULK_FIELDS.map((key) => (line.record ? formatFieldValue(key, line.record[key]) : '')),
    BULK_STATUS_LABELS[line.status] ?? '',
    line.error?.message ?? '',
  ])
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
