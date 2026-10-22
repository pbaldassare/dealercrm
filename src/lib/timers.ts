export function deadlineAt(from: Date, minutes: number | null): Date | null {
  if (minutes == null) return null
  return new Date(from.getTime() + minutes * 60_000)
}

export function assignedEscalation(elapsedMin: number) {
  if (elapsedMin >= 60) return 'reassign'
  if (elapsedMin >= 30) return 'warn_manager'
  if (elapsedMin >= 15) return 'warn_salesperson'
  return null
}
