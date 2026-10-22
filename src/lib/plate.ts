const ITALIAN_PLATE = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '')
}

export function isValidItalianPlate(raw: string): boolean {
  return ITALIAN_PLATE.test(normalizePlate(raw))
}
