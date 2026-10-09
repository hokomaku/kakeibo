export type EntryKind = 'expense' | 'income'
export type Payer = 'you' | 'wife'

export type Category = {
  id: string
  name: string
  kind: EntryKind
  active: boolean
}

export type Transaction = {
  id: string
  household_id: string
  entry_date: string
  kind: EntryKind
  category_id: string
  amount_yen: number
  payer: Payer
  is_credit: boolean
  memo: string
  created_at: string
  updated_at: string
  categories?: { name: string; kind: EntryKind } | null
}

export const yen = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n)
