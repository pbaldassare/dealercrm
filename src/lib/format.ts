export function formatEuro(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

export const LEAD_STATUS_IT: Record<string, string> = {
  new: 'Nuova',
  ai_qualifying: 'Qualifica IA',
  qualified: 'Qualificata',
  assigned: 'Assegnata',
  contacted: 'Contattata',
  appointment_set: 'Appuntamento',
  visited: 'Visita',
  proposal_sent: 'Proposta',
  negotiating: 'Trattativa',
  won: 'Vinta',
  lost: 'Persa',
  invalid: 'Non valida',
}

export const VEHICLE_STATUS_IT: Record<string, string> = {
  incoming: 'In arrivo',
  received: 'Ricevuta',
  reconditioning: 'Ricondizionamento',
  ready: 'Pronta',
  published: 'Pubblicata',
  reserved: 'Riservata',
  sold: 'Venduta',
  delivering: 'In consegna',
  delivered: 'Consegnata',
  withdrawn: 'Ritirata',
}

export const DEAL_STATUS_IT: Record<string, string> = {
  open: 'Aperta',
  quote_sent: 'Preventivo',
  contract_pending: 'Contratto in attesa',
  signed: 'Firmata',
  payment_pending: 'Pagamento',
  transfer_documents: 'Passaggio',
  delivered: 'Consegnata',
  closed: 'Chiusa',
  cancelled: 'Annullata',
}
