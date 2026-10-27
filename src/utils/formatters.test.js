import { describe, expect, it } from 'vitest'
import {
  bulkResultsToCsv,
  flattenBulkResults,
  formatFieldValue,
  getAllotmentStatus,
  getColumns,
  maskIdentifier,
  recordsToCsv,
  summarizeBulkResults,
} from './formatters.js'

describe('masking', () => {
  it('masks all but the last 4 characters', () => {
    expect(maskIdentifier('ABCDE1234F')).toBe('XXXXXX234F')
  })

  it('masks PAN, DP ID and PAN-like extra fields', () => {
    expect(formatFieldValue('Pan_No', 'ABCDE1234F')).toBe('XXXXXX234F')
    expect(formatFieldValue('DP_CLID', 'IN30012345678901')).toBe('XXXXXXXXXXXX8901')
    expect(formatFieldValue('PAN', 'ABCDE1234F')).toBe('XXXXXX234F')
    expect(formatFieldValue('Name', 'Jane Doe')).toBe('Jane Doe')
  })
})

describe('getColumns', () => {
  it('only includes fields that have a value, known fields first', () => {
    const cols = getColumns([
      { Zeta: 'z', All_Shares: '0', Appln_No: '1', Empty: '' },
      { Name: 'A', Missing: null },
    ])
    expect(cols).toEqual(['Name', 'Appln_No', 'All_Shares', 'Zeta'])
  })
})

describe('getAllotmentStatus', () => {
  it('derives status only from an explicit numeric All_Shares', () => {
    expect(getAllotmentStatus({ All_Shares: '25' })).toBe('allotted')
    expect(getAllotmentStatus({ All_Shares: 0 })).toBe('not_allotted')
    expect(getAllotmentStatus({ All_Shares: '' })).toBeNull()
    expect(getAllotmentStatus({ All_Shares: 'N/A' })).toBeNull()
    expect(getAllotmentStatus({})).toBeNull()
  })
})

describe('recordsToCsv', () => {
  it('exports masked values, escapes quotes and neutralises formulas', () => {
    const csv = recordsToCsv([{ Name: 'Doe, "J"', Pan_No: 'ABCDE1234F', All_Shares: '10', Note: '=HYPERLINK()' }], {
      ipoName: 'TEST IPO',
    })
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('IPO,Applicant name,PAN,Shares allotted,Note,Allotment status')
    expect(row).toBe('TEST IPO,"Doe, ""J""",XXXXXX234F,10,\'=HYPERLINK(),Allotted')
    expect(csv).not.toContain('ABCDE1234F')
  })
})

describe('bulk results', () => {
  const RESULTS = [
    { pan: 'ABCDE1234F', status: 'done', records: [{ Name: 'A', All_Shares: '10' }, { Name: 'A', All_Shares: '0' }] },
    { pan: 'PQRST5678K', status: 'done', records: [] },
    { pan: 'LMNOP9012Z', status: 'error', records: [], error: { message: 'Timed out' } },
    { pan: 'XYZAB3456C', status: 'pending', records: [] },
  ]

  it('flattens to one line per record, keeping each PAN’s input position', () => {
    expect(flattenBulkResults(RESULTS).map((l) => [l.index, l.status])).toEqual([
      [1, 'allotted'],
      [1, 'not_allotted'],
      [2, 'no_record'],
      [3, 'error'],
      [4, 'pending'],
    ])
  })

  it('summarises counts', () => {
    expect(summarizeBulkResults(RESULTS)).toEqual({
      total: 4,
      finished: 3,
      allotted: 1,
      not_allotted: 1,
      no_record: 1,
      error: 1,
    })
  })

  it('exports masked PANs with status and error columns', () => {
    const csv = bulkResultsToCsv(RESULTS, { ipoName: 'TEST IPO' })
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('#,IPO,PAN,Applicant name,Application no.,Category,Shares applied,Shares allotted,Status,Error')
    expect(lines[1]).toBe('1,TEST IPO,XXXXXX234F,A,,,,10,Allotted,')
    expect(lines[3]).toBe('2,TEST IPO,XXXXXX678K,,,,,,No record,')
    expect(lines[4]).toBe('3,TEST IPO,XXXXXX012Z,,,,,,Error,Timed out')
    expect(csv).not.toContain('ABCDE1234F')
  })
})
