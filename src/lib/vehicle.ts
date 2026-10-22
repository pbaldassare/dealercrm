export type VehicleKind = 'new' | 'km0' | 'used'

export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = {
  new: 'Nuova',
  km0: 'Km0',
  used: 'Usata',
}

export type VehiclePublic = {
  id: string
  plate: string
  make: string | null
  model: string | null
  trim: string | null
  kind: VehicleKind
  status: string
  sale_price: number | null
  days_in_stock: number | null
}
