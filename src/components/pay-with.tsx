/**
 * PayWith — the "Pay with" picker shared by the ad form, the boost dialog, the messaging packages dialog and the
 * AI prompt pack.
 *
 * A UKO service is paid one of two ways:
 *   • M-PESA — an STK push to the seller's phone; what was bought is granted when Safaricom confirms.
 *   • a wallet — seller earnings, refunds, or the shelf / delivery / courier wallet of a partner staff linked to this
 *     account — money the account already has with UKO
 *     (GET /api/wallet/payable). The price moves straight from the wallet to credit_payments, so the boost,
 *     the units or the prompts are there at once: no PIN, no waiting and no fee.
 * The 10% fee is charged only when money leaves a wallet for M-PESA — that is a withdrawal, not a payment.
 * Wallets pay for UKO services only: never an order, and never another wallet.
 */
import { useEffect, useState } from 'react'
import { Smartphone, Wallet } from 'lucide-react'
import { api, type PayableWallet, type WalletRole } from '#/lib/api'
import { ksh } from '#/lib/format'
import { Radio, cx } from './ui'

export type PayChoice = { method: 'mpesa' | 'wallet'; wallet_role: WalletRole }
export const PAY_BY_MPESA: PayChoice = { method: 'mpesa', wallet_role: 'seller' }
/** What each wallet is called on screen · matches services.WALLET_LABELS in the API. */
export const WALLET_NAMES: Record<WalletRole, string> = { seller: 'Seller wallet', shelve: 'Shelf wallet', rider: 'Delivery wallet', courier: 'Courier wallet', buyer: 'Refund wallet' }
export const WALLET_SUBS: Record<WalletRole, string> = {
  seller: 'Money released to you from sales',
  shelve: 'Your shelf commission and inspection fees',
  rider: 'Delivery fees you have earned',
  courier: 'Courier leg fees you have earned',
  buyer: 'Money paid back for cancelled or returned items',
}
/** Why a wallet is empty, so a seller who has never sold knows what would fill it. */
export const WALLET_EMPTY: Record<WalletRole, string> = {
  seller: 'sales are released here once a buyer claims',
  shelve: 'your shelf commission lands here',
  rider: 'delivery fees land here',
  courier: 'courier leg fees land here',
  buyer: 'refunds for cancelled or returned items land here',
}

/** Every wallet this account holds, whatever is in it — an empty one is still shown, greyed out, so a seller can
 * see that paying from his wallet is an option at all. Empty list while it loads, or if the call fails. */
export function usePayableWallets(enabled = true): PayableWallet[] {
  const [wallets, setWallets] = useState<PayableWallet[]>([])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    api.get<{ wallets: PayableWallet[] }>('/wallet/payable')
      .then((r) => { if (alive) setWallets(r.wallets || []) })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
  return wallets
}

/** True when this choice can actually pay `amount` — a wallet has to hold it. */
export function canPay(choice: PayChoice, wallets: PayableWallet[], amount: number): boolean {
  if (choice.method !== 'wallet') return true
  const w = wallets.find((x) => x.role === choice.wallet_role)
  return !!w && w.balance >= amount
}

export function PayWith({ amount, wallets, value, onChange, className, columns = 2 }: {
  amount: number
  wallets: PayableWallet[]
  value: PayChoice
  onChange: (c: PayChoice) => void
  className?: string
  columns?: 1 | 2 | 3
}) {
  const cols = columns === 1 ? '' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
  const row = (on: boolean, short: boolean) =>
    cx('flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors',
       short ? 'cursor-not-allowed border-border bg-surface opacity-60' : on ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <span className="text-xs font-semibold text-ink-2">Pay with</span>
      <div className={cx('grid gap-2', cols)}>
        <button type="button" onClick={() => onChange(PAY_BY_MPESA)} className={row(value.method === 'mpesa', false)}>
          <Radio checked={value.method === 'mpesa'} className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[13px] font-bold"><Smartphone size={14} className="shrink-0 text-primary" /> M-PESA</span>
            <span className="text-[11px] text-ink-2">PIN prompt to your phone</span>
          </span>
        </button>
        {wallets.map((w) => {
          const on = value.method === 'wallet' && value.wallet_role === w.role
          const short = w.balance < amount
          return (
            <button key={w.role} type="button" disabled={short} onClick={() => onChange({ method: 'wallet', wallet_role: w.role })} className={row(on, short)}>
              <Radio checked={on} className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[13px] font-bold"><Wallet size={14} className="shrink-0 text-primary" /> {WALLET_NAMES[w.role]}</span>
                <span className="text-[11px] text-ink-2">
                  {w.balance <= 0 ? `Empty — ${WALLET_EMPTY[w.role]}` : `${ksh(w.balance)} available${short ? ` · not enough for ${ksh(amount)}` : ' · paid instantly'}`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {value.method === 'wallet' && (
        <span className="text-[11px] text-muted">
          {ksh(amount)} comes out of your {WALLET_NAMES[value.wallet_role].toLowerCase()} straight away — no PIN and no charge for using it. The 10% fee
          applies only when you withdraw that money to M-PESA instead.
        </span>
      )}
    </div>
  )
}
