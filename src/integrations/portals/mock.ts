export const FEATURE_PORTALS_REAL = import.meta.env.FEATURE_PORTALS_REAL === 'true'

export async function withdrawListing(externalId: string) {
  if (FEATURE_PORTALS_REAL) {
    throw new Error('Real portal adapters are disabled until credentials exist')
  }
  return { ok: true, externalId, mock: true }
}
