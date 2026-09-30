/**
 * Chat options on an order — the people either side of an order can message about it.
 * A buyer reaches every seller on it, every shelf it touches and the rider on the run; a seller reaches
 * the buyer, the rider, and only the shelves that hold *his own* lines — one order can carry items from
 * several sellers on several shelves, and a seller has no business messaging the shelf that is keeping
 * another seller's item. The shelf the whole order is collected from is the one exception: it receives
 * his item too, so he can ask about the hand-over. Each shelf chip says which of the two a shelf is,
 * because an order that moves shelf to shelf names two of them and the names alone do not say which is
 * which: a *holding* shelf is where the item sits, the *collection* shelf is where the buyer picks it up.
 *
 * Chat is user-to-user (`/chat/{users_id}`), so a party with no UKO account behind it — a shelf whose
 * owner never signed up, a rider added by an admin — is shown greyed with the reason instead of a link.
 */
import { Link } from '@tanstack/react-router'
import { Bike, MessageCircle, Store, User, Warehouse, type LucideIcon } from 'lucide-react'
import type { Order, OrderItem, Shelve } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { cx } from './ui'

export type ChatRole = 'seller' | 'shelve' | 'delivery' | 'buyer'
export type ChatViewer = 'buyer' | 'seller'
export type ChatTarget = {
  role: ChatRole
  /** Chip text — the role, plus the name when we know it ("Rider · Dan K.") */
  label: string
  /** Who the message goes to; null when that party has no UKO account to chat with */
  userId: number | null
  /** Opens the thread with this item pinned, so the other side sees what the order is about */
  itemId?: number
  /** Shown on the greyed chip when `userId` is null */
  why: string
}

const ICON: Record<ChatRole, LucideIcon> = { seller: Store, shelve: Warehouse, delivery: Bike, buyer: User }

/**
 * What a shelf is doing on this order. `both` is a shelf the buyer collects from that is also holding the
 * item — a pick-up, or a run that never left the shelf — where there is nothing to tell apart and the chip
 * says plain "Shelf".
 */
type ShelfKind = 'holding' | 'collection' | 'both'

const SHELF_LABEL: Record<ShelfKind, string> = { holding: 'Holding shelf', collection: 'Collection shelf', both: 'Shelf' }
const mergeKind = (a: ShelfKind, b: ShelfKind): ShelfKind => (a === b ? a : 'both')

/** One shelf to chat with, flattened from either an order-level shelf or an order line. */
type ShelfRef = { id: number; name: string; ownerId: number | null; phone: string; kind: ShelfKind; itemId?: number }

const fromShelve = (s: Shelve, kind: ShelfKind): ShelfRef => ({ id: s.id, name: s.name, ownerId: s.owner_users_id ?? null, phone: s.contact_phone, kind })
const fromLine = (it: OrderItem): ShelfRef => ({ id: it.shelve_id as number, name: it.shelve_name, ownerId: it.shelve_owner_users_id ?? null, phone: it.shelve_phone, kind: 'holding', itemId: it.item_id })

/** The shelves the order itself names: where it is held, where the buyer collects, where the run started. */
function orderShelves(o: Order): ShelfRef[] {
  return ([[o.shelve, 'holding'], [o.collect_shelve, 'collection'], [o.delivery?.origin, 'holding']] as const)
    .filter(([s]) => s)
    .map(([s, kind]) => fromShelve(s as Shelve, kind))
}

/**
 * First reference of each shelf wins, so the richer order-level record beats the line-level one — but the
 * roles add up rather than overwrite, so one shelf named twice for two different reasons comes back `both`.
 */
function dedupe(refs: ShelfRef[]): ShelfRef[] {
  const out: ShelfRef[] = []
  for (const r of refs) {
    if (!r.id) continue
    const seen = out.find((x) => x.id === r.id)
    if (seen) {
      seen.itemId = seen.itemId ?? r.itemId
      seen.kind = mergeKind(seen.kind, r.kind)
    } else out.push({ ...r })
  }
  return out
}

/**
 * Which shelves this viewer may talk to about the order. The buyer bought the whole cart, so every
 * shelf on it is his to ask; a seller only owns his own lines, so he gets the shelves those lines sit
 * on (named by the order where it knows them, so he still sees the phone number) plus the collection
 * shelf his item is handed over at.
 */
function shelvesFor(o: Order, viewer: ChatViewer, selfId?: number): ShelfRef[] {
  const lines = viewer === 'seller' && selfId ? o.items.filter((it) => it.seller_id === selfId) : o.items
  const fromLines = lines.filter((it) => it.shelve_id).map(fromLine)
  if (viewer === 'buyer') return dedupe([...orderShelves(o), ...fromLines])
  const known = new Map(orderShelves(o).map((s) => [s.id, s]))
  // These are the shelves his own lines sit on, so they are holding whatever else the order calls them;
  // the collection shelf appended after it turns into `both` in `dedupe` when they are the same shelf.
  const mine = fromLines.map((r) => ({ ...(known.get(r.id) || r), itemId: r.itemId, kind: 'holding' as const }))
  return dedupe([...mine, ...(o.collect_shelve ? [fromShelve(o.collect_shelve, 'collection')] : [])])
}

/**
 * Who this viewer can chat with about `o`. Only parties the order actually has come back — a direct
 * sale has no shelf and no rider, an unpaid order has no rider yet — which is what keeps the row honest.
 */
export function orderChatTargets(o: Order, viewer: ChatViewer, selfId?: number): ChatTarget[] {
  const list: ChatTarget[] = []

  // A seller pins every thread to one of his own items, never to a line he has nothing to do with.
  const ownLine = viewer === 'seller' && selfId ? o.items.find((it) => it.seller_id === selfId) : o.items[0]

  if (viewer === 'buyer') {
    const sellerIds = [...new Set(o.items.map((i) => i.seller_id).filter(Boolean))]
    sellerIds.forEach((id, i) => {
      const line = o.items.find((it) => it.seller_id === id)
      list.push({
        role: 'seller',
        label: sellerIds.length > 1 ? `Seller ${i + 1}` : 'Seller',
        userId: id || null,
        itemId: line?.item_id,
        why: 'This seller no longer has a UKO account',
      })
    })
  } else {
    list.push({
      role: 'buyer',
      label: o.buyer_name ? `Buyer · ${o.buyer_name}` : 'Buyer',
      userId: o.buyer_id || null,
      itemId: ownLine?.item_id,
      why: 'This buyer no longer has a UKO account',
    })
  }

  for (const s of shelvesFor(o, viewer, selfId)) {
    list.push({
      role: 'shelve',
      label: s.name ? `${SHELF_LABEL[s.kind]} · ${s.name}` : SHELF_LABEL[s.kind],
      userId: s.ownerId,
      itemId: s.itemId ?? ownLine?.item_id,
      why: `${s.name || 'This shelf'} has no UKO account linked yet — call ${s.phone || 'the shelf'} instead`,
    })
  }

  const r = o.delivery?.rider
  if (r) {
    list.push({
      role: 'delivery',
      label: r.name ? `Rider · ${r.name}` : 'Rider',
      userId: r.users_id ?? null,
      itemId: ownLine?.item_id,
      why: `${r.name || 'This rider'} has no UKO account to chat with — call ${r.phone || 'the rider'} instead`,
    })
  }

  // Never offer a chat with yourself: a seller who owns the shelf, a buyer collecting from his own.
  return list.filter((t) => !(selfId && t.userId === selfId))
}

const PILL = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold leading-none transition-colors'
const PILL_ON = 'border-border-strong bg-bg text-ink hover:border-primary hover:text-primary'
const PILL_OFF = 'cursor-not-allowed border-dashed border-border bg-transparent text-muted'

/** The chat row under an order card. Renders nothing when there is nobody to talk to. */
export function OrderChat({ order, viewer, className }: { order: Order; viewer: ChatViewer; className?: string }) {
  const { user } = useAuth()
  const targets = orderChatTargets(order, viewer, user?.id)
  if (targets.length === 0) return null
  return (
    <div className={cx('flex flex-col gap-2 rounded-md bg-surface p-2.5', className)}>
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <MessageCircle size={11} /> Chat about this order
      </span>
      <div className="flex flex-wrap gap-1.5">
        {targets.map((t, i) => {
          const Icon = ICON[t.role]
          const body = (
            <>
              <Icon size={12} className="shrink-0" />
              <span className="max-w-[190px] truncate">{t.label}</span>
            </>
          )
          return t.userId ? (
            <Link
              key={`${t.role}-${t.userId}`}
              to={'/chat/$userId' as any}
              params={{ userId: String(t.userId) } as any}
              search={(t.itemId ? { item: t.itemId } : {}) as any}
              title={`Chat with ${t.label}`}
              className={cx(PILL, PILL_ON)}
            >
              {body}
            </Link>
          ) : (
            <span key={`${t.role}-off-${i}`} title={t.why} aria-disabled className={cx(PILL, PILL_OFF)}>{body}</span>
          )
        })}
      </div>
    </div>
  )
}
