import { describe, it, expect } from 'vitest'
import { liveFilter } from './liveFilter'

describe('liveFilter', () => {
  it('keeps a selection that is still one of the options', () => {
    expect(liveFilter('field-2', ['field-1', 'field-2'])).toBe('field-2')
  })

  it('keeps "all" whatever the options are', () => {
    expect(liveFilter('all', [])).toBe('all')
    expect(liveFilter('all', ['field-1'])).toBe('all')
  })

  it('falls back to "all" when the selected value is gone', () => {
    // The sample farm was switched off: its fields left, the farmer's own
    // fields are the options now.
    expect(liveFilter('sample-field-1', ['field-1', 'field-2'])).toBe('all')
    expect(liveFilter('sample-field-1', [])).toBe('all')
  })

  it('applies the selection again if its value comes back', () => {
    const selected = 'spray'
    expect(liveFilter(selected, ['harvest'])).toBe('all')
    expect(liveFilter(selected, ['harvest', 'spray'])).toBe('spray')
  })
})
