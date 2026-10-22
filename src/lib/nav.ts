import type { AppRole } from './types'

export type NavItem = { to: string; label: string }

const ALL: NavItem[] = [
  { to: '/oggi', label: 'Oggi' },
  { to: '/lead', label: 'Lead' },
  { to: '/auto', label: 'Auto' },
  { to: '/condizioni', label: 'Condizioni' },
  { to: '/pratiche', label: 'Pratiche' },
  { to: '/piazzale', label: 'Piazzale' },
  { to: '/fornitori', label: 'Fornitori' },
  { to: '/report', label: 'Report' },
  { to: '/import', label: 'Import' },
  { to: '/parametri', label: 'Parametri' },
]

const BY_ROLE: Record<AppRole, string[]> = {
  admin: ALL.map((i) => i.to),
  owner: ['/oggi', '/lead', '/auto', '/pratiche', '/piazzale', '/report', '/parametri'],
  sales_manager: ['/oggi', '/lead', '/auto', '/pratiche', '/piazzale', '/report', '/parametri'],
  salesperson: ['/oggi', '/lead', '/auto', '/pratiche', '/piazzale', '/report'],
  used_manager: ['/auto', '/condizioni', '/fornitori', '/import', '/piazzale', '/report'],
  reconditioning: ['/auto', '/condizioni', '/piazzale'],
  yard: ['/auto', '/condizioni', '/piazzale'],
  accounting: ['/lead', '/auto', '/pratiche', '/report'],
  finance_insurance: ['/lead', '/auto', '/pratiche', '/report'],
  marketing: ['/auto', '/report'],
}

export function navForRole(role: AppRole | undefined): NavItem[] {
  if (!role) return []
  const allowed = new Set(BY_ROLE[role])
  return ALL.filter((item) => allowed.has(item.to))
}
