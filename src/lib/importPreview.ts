import { isValidItalianPlate, normalizePlate } from './plate'

export type ImportAction = 'create' | 'skip' | 'duplicate'

export type VehicleImportRow = {
  plate: string
  make?: string
  model?: string
}

export function previewVehicleImport(
  rows: VehicleImportRow[],
  existingPlates: string[],
): { valid: number; skipped: number; duplicates: number; actions: ImportAction[] } {
  const known = new Set(existingPlates.map(normalizePlate))
  const seen = new Set<string>()
  const actions: ImportAction[] = []
  let valid = 0
  let skipped = 0
  let duplicates = 0

  for (const row of rows) {
    const plate = normalizePlate(row.plate ?? '')
    if (!isValidItalianPlate(plate) || !row.make) {
      actions.push('skip')
      skipped += 1
      continue
    }
    if (known.has(plate) || seen.has(plate)) {
      actions.push('duplicate')
      duplicates += 1
      continue
    }
    seen.add(plate)
    actions.push('create')
    valid += 1
  }

  return { valid, skipped, duplicates, actions }
}
