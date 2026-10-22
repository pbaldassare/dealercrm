export const FEATURE_MESSAGING_REAL = import.meta.env.FEATURE_MESSAGING_REAL === 'true'

export async function sendMessage(to: string, templateKey: string) {
  if (FEATURE_MESSAGING_REAL) {
    throw new Error('Real messaging is off until GHL/WhatsApp credentials exist')
  }
  return { ok: true, to, templateKey, mock: true }
}
