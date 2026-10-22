import { describe, expect, it } from 'vitest'
import { previewVehicleImport } from './importPreview'

describe('previewVehicleImport', () => {
  it('counts valid, skipped and duplicate plates before writing', () => {
    const result = previewVehicleImport(
      [
        { plate: 'zz 102 aa', make: 'BMW' },
        { plate: 'BAD', make: 'X' },
        { plate: 'ZZ102AA', make: 'BMW' },
      ],
      ['ZZ102AA'],
    )
    expect(result).toMatchObject({ valid: 0, skipped: 1, duplicates: 2 })
  })
})
