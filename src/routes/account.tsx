/** Account — mobile "Account" tab — /account */
import { createFileRoute } from '@tanstack/react-router'
import { Bell, Bike, ChevronRight, LogOut, MessageSquare, Package, Settings, Store, Tag, Truck, UserRound, Wallet as WalletIcon, type LucideIcon } from 'lucide-react'
import { COURIER_URL, DELIVERY_URL, SHELVES_URL } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { ksh } from '#/lib/format'
import { AppLink, Avatar, Button, Card, Chip, LinkButton, PageLoading } from '#/components/ui'

export const Route = createFileRoute('/account')({ component: AccountPage })

type QuickLink = { to: string; label: string; sub: string; Icon: LucideIcon }

function AccountPage() {
  const { user, ready, logout } = useAuth()

  if (!ready) return <PageLoading />

  if (!user) {
    return (
      <div className="container-x flex flex-col items-center gap-4 py-16 text-center md:py-24">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-050 text-primary"><UserRound size={28} /></span>
        <h1 className="text-2xl">Your account</h1>
        <p className="m-0 max-w-sm text-sm text-ink-2">Sign in to see your orders, messages, wallets and seller tools.</p>
        <div className="flex w-full max-w-xs flex-col gap-2.5 pt-2">
          <LinkButton to={'/signin' as any} full>Sign in</LinkButton>
          <LinkButton to={'/register' as any} variant="outline" full>Create account</LinkButton>
        </div>
      </div>
    )
  }

  // The seller page shows up once he has posted an ad — that is what turns the account into a seller one.
  const links: QuickLink[] = [
    { to: '/orders', label: 'My orders', sub: 'Claim codes, tracking and receipts', Icon: Package },
    { to: '/profile', label: 'Profile', sub: 'Your details, extra e-mails and M-PESA number', Icon: UserRound },
    ...(user.roles.seller ? [{ to: '/seller', label: 'Seller items page', sub: 'Your ads, boosts and earnings', Icon: Tag }] : []),
    { to: '/chat', label: 'Messages', sub: 'Chats with buyers and sellers', Icon: MessageSquare },
    { to: '/notifications', label: 'Notifications', sub: 'Order updates and alerts', Icon: Bell },
    { to: '/settings', label: 'Settings', sub: 'Push, SMS and e-mail notifications, marketing', Icon: Settings },
  ]
  const roleLinks: QuickLink[] = []
  // Partner consoles are their own apps with their own sign-in (the company e-mail staff assigned) — linked here for convenience.
  if (user.roles.shelve_owner) roleLinks.push({ to: `${SHELVES_URL}/dashboard`, label: 'Shelve owner', sub: 'Verify drops and manage slots · signs in with your company e-mail', Icon: Store })
  if (user.roles.rider) roleLinks.push({ to: `${DELIVERY_URL}/dashboard`, label: 'Delivery partner', sub: 'Offers, pickups and drops · signs in with your company e-mail', Icon: Bike })
  if (user.roles.courier) roleLinks.push({ to: `${COURIER_URL}/dashboard`, label: 'Courier driver', sub: 'Loads between towns · signs in with your company e-mail', Icon: Truck })

  const name = user.profile?.store_name || user.name
  const wallets = user.wallets
  // One row per role he actually holds — the seller wallet arrives with his first ad. The refund wallet
  // is everyone's: it is where money for a cancelled or returned item comes back to. Shelf, rider and courier
  // wallets belong to the partner staff linked to this account: they pay for UKO services here and are withdrawn
  // in the partner's own app, which is where each row leads.
  const walletRows: { role: 'seller' | 'shelve' | 'rider' | 'courier' | 'buyer'; label: string; sub: string; to: string; Icon: LucideIcon; balance: number }[] = []
  walletRows.push({ role: 'buyer', label: 'Refund wallet', sub: 'Refunds for cancelled or returned items · no withdrawal fee', to: '/wallet', Icon: WalletIcon, balance: wallets?.buyer ?? 0 })
  if (user.roles.seller) walletRows.push({ role: 'seller', label: 'Seller wallet', sub: '', to: '/seller', Icon: Tag, balance: wallets?.seller ?? 0 })
  const partnerSub = 'Spend on UKO services here · withdraw in the partner app'
  if (user.roles.shelve_owner) walletRows.push({ role: 'shelve', label: 'Shelf wallet', sub: partnerSub, to: `${SHELVES_URL}/dashboard`, Icon: Store, balance: wallets?.shelve ?? 0 })
  if (user.roles.rider) walletRows.push({ role: 'rider', label: 'Rider wallet', sub: partnerSub, to: `${DELIVERY_URL}/dashboard`, Icon: Bike, balance: wallets?.rider ?? 0 })
  if (user.roles.courier) walletRows.push({ role: 'courier', label: 'Courier wallet', sub: partnerSub, to: `${COURIER_URL}/dashboard`, Icon: Truck, balance: wallets?.courier ?? 0 })

  return (
    <div className="container-x flex flex-col gap-5 pb-6 pt-5 md:max-w-2xl md:pt-8">
      {/* Profile summary */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={user.name} src={user.profile?.avatar || undefined} size={56} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="truncate text-lg md:text-xl">{name}</h1>
            <span className="truncate text-xs text-ink-2">{user.email}</span>
            {user.telephone && <span className="text-xs text-ink-2">{user.telephone}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.roles.seller && <Chip size="sm" tone="primary">Seller{user.profile?.seller_package ? ` · ${user.profile.seller_package}` : ''}</Chip>}
          {user.roles.shelve_owner && <Chip size="sm" tone="success">Shelf host</Chip>}
          {user.roles.rider && <Chip size="sm" tone="secondary">Rider</Chip>}
          {user.roles.courier && <Chip size="sm" tone="secondary">Courier</Chip>}
          {user.profile?.ward && <Chip size="sm">{user.profile.ward} ward</Chip>}
        </div>
      </Card>

      {/* Wallets — the refund wallet plus one per role he holds, linked to the matching console. */}
      {walletRows.length > 0 && <section className="flex flex-col gap-2">
        <span className="px-1 text-xs font-bold uppercase tracking-wide text-muted">Wallets</span>
        <Card padded={false} className="divide-y divide-border">
          {walletRows.map(({ role, label, sub, to, Icon, balance }) => (
            <AppLink key={role} to={to} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success-050 text-success"><Icon size={18} /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{label}</span>
                <span className="truncate text-xs text-ink-2">{sub || 'Escrow releases and withdrawals'}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-head text-base font-extrabold text-ink">{ksh(balance)}</span>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </span>
            </AppLink>
          ))}
        </Card>
      </section>}

      {/* Quick links */}
      <LinkList title="Your activity" links={links} />
      {roleLinks.length > 0 && <LinkList title="Your roles" links={roleLinks} />}

      <Button variant="outline" full icon={<LogOut size={15} />} onClick={() => logout()} className="text-danger">Sign out</Button>
    </div>
  )
}

function LinkList({ title, links }: { title: string; links: QuickLink[] }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</span>
      <Card padded={false} className="divide-y divide-border">
        {links.map(({ to, label, sub, Icon }) => (
          <AppLink key={to} to={to} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={18} /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">{label}</span>
              <span className="truncate text-xs text-ink-2">{sub}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </AppLink>
        ))}
      </Card>
    </section>
  )
}
