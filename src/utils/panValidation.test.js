import { describe, expect, it } from 'vitest'
import { getPanValidationMessage, isValidPanFormat, normalizePan, parsePanList, sanitizePanInput } from './panValidation.js'

describe('normalizePan', () => {
  it('trims and uppercases', () => {
    expect(normalizePan('  abcde1234f ')).toBe('ABCDE1234F')
  })

  it('handles null and undefined', () => {
    expect(normalizePan(null)).toBe('')
    expect(normalizePan(undefined)).toBe('')
  })
})

describe('sanitizePanInput', () => {
  it('uppercases, strips whitespace and symbols, caps at 10 chars', () => {
    expect(sanitizePanInput(' ab cde-1234f ')).toBe('ABCDE1234F')
    expect(sanitizePanInput('ABCDE1234FXYZ')).toBe('ABCDE1234F')
  })
})

describe('isValidPanFormat', () => {
  it.each(['ABCDE1234F', 'abcde1234f', ' ABCDE1234F '])('accepts %j', (pan) => {
    expect(isValidPanFormat(pan)).toBe(true)
  })

  it.each(['', 'ABCD1234F', 'ABCDE12345', '1BCDE1234F', 'ABCDE1234', 'ABCDE1234FF', 'ABCDE 1234F', 'ABCDE123$F'])(
    'rejects %j',
    (pan) => {
      expect(isValidPanFormat(pan)).toBe(false)
    },
  )
})

describe('parsePanList', () => {
  it('splits on newlines, commas, semicolons and spaces, normalising case', () => {
    expect(parsePanList('abcde1234f\nPQRST5678K, LMNOP9012Z;  XYZAB3456C\r\n').valid).toEqual([
      'ABCDE1234F',
      'PQRST5678K',
      'LMNOP9012Z',
      'XYZAB3456C',
    ])
  })

  it('drops duplicates, keeping first-seen order, and counts them', () => {
    expect(parsePanList('PQRST5678K ABCDE1234F pqrst5678k')).toEqual({
      valid: ['PQRST5678K', 'ABCDE1234F'],
      invalid: [],
      duplicates: 1,
    })
  })

  it('reports invalid entries separately', () => {
    expect(parsePanList('ABCDE1234F, ABC123, 1234567890')).toEqual({
      valid: ['ABCDE1234F'],
      invalid: ['ABC123', '1234567890'],
      duplicates: 0,
    })
  })

  it('handles empty input', () => {
    expect(parsePanList('  \n ')).toEqual({ valid: [], invalid: [], duplicates: 0 })
    expect(parsePanList(null)).toEqual({ valid: [], invalid: [], duplicates: 0 })
  })
})

describe('getPanValidationMessage', () => {
  it('returns empty string for a well-formed PAN', () => {
    expect(getPanValidationMessage('ABCDE1234F')).toBe('')
  })

  it('explains empty, wrong-length and wrong-pattern input', () => {
    expect(getPanValidationMessage('')).toMatch(/enter your PAN/i)
    expect(getPanValidationMessage('ABC')).toMatch(/exactly 10/i)
    expect(getPanValidationMessage('1234567890')).toMatch(/5 letters/i)
  })
})
