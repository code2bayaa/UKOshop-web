/**
 * Refund wallet — /wallet
 *
 * Where money for a cancelled or returned item comes back to. It is the one wallet UKO takes nothing from
 * on the way out: the balance is the buyer's own money, so it withdraws to M-PESA without the 10 % every
 * earning wallet pays, and it can be spent on UKO as it is. Seller, shelf and rider wallets live in their
 * own consoles; this page is every account's.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Wallet as WalletIcon } from 'lucide-react'
import { useAuth } from '#/lib/auth'
import { PageLoading, PageTitle } from '#/components/ui'
import { WalletPanel } from '#/components/wallet'

export const Route = createFileRoute('/wallet')({ component: RefundWalletPage })

function RefundWalletPage() {
  const navigate = useNavigate()
  const { user, ready } = useAuth()

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: '/wallet' } })
  }, [ready, user, navigate])

  if (!ready || !user) return <PageLoading />

  return (
    <div className="container-x flex flex-col gap-4 py-5 pb-24 md:gap-[18px] md:py-7 md:pb-12">
      <PageTitle
        title="Refund wallet"
        sub="Money paid back for items that were cancelled or returned. Withdraw it to M-PESA — refunds pay no withdrawal fee — or spend it on UKO."
      />
      <WalletPanel
        role="buyer"
        intro={
          <span className="flex items-center gap-2 text-[13px] text-ink-2">
            <WalletIcon size={15} className="text-success" />
            A cancelled or returned item is refunded here the moment the seller marks it, item by item.
          </span>
        }
      />
    </div>
  )
}
