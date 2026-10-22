export type AppRole =
  | 'admin'
  | 'owner'
  | 'sales_manager'
  | 'salesperson'
  | 'used_manager'
  | 'reconditioning'
  | 'yard'
  | 'accounting'
  | 'finance_insurance'
  | 'marketing'

export type Profile = {
  id: string
  dealership_id: string
  full_name: string
  role: AppRole
  is_active: boolean
  is_available: boolean
  enabled_bands?: string[]
}

export type Device = {
  id: string
  user_id: string
  install_id: string
  name: string | null
  status: 'pending' | 'authorized' | 'revoked'
}

export type Setting = {
  id: string
  dealership_id: string
  key: string
  value: unknown
}
