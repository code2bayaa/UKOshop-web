/**
 * Checkout helpers shared by /cart, /checkout/* and /orders:
 * session state ("uko_checkout"), sticky mobile CTA (frames M4–M7) and mini item rows.
 */
import type { ReactNode } from 'react'
import { ImageIcon } from 'lucide-react'
import { ksh } from '#/lib/format'
import { cx } from './ui'

export type CheckoutState = {
  funds?: boolean
  account?: boolean
  sms?: boolean
  shelve_id?: number | null
  shelve_name?: string
  shelve_ward?: string
  /** Where the buyer collects, for the options that end at a shelf rather than at his door
   *  (`shelf_run`, `courier`). Null for a run to his gate, and for collecting at each shelf. */
  collect_shelve_id?: number | null
  collect_shelve_name?: string
  collect_shelve_ward?: string
  delivery_option?: string
  delivery_title?: string
  delivery_fee?: number
  recipient_name?: string
  phone?: string
  estate?: string
  house?: string
  ward?: string
  county?: string
  country?: string
  /** The buyer's pin on the checkout map — prices the rider trip and is where he rides to. */
  dest_lat?: number | null
  dest_lng?: number | null
  notes?: string
}

const KEY = 'uko_checkout'

/** Only call from effects / handlers (never during render — SSR). */
export function readCheckout(): CheckoutState {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') as CheckoutState
  } catch {
    return {}
  }
}

export function writeCheckout(patch: CheckoutState): CheckoutState {
  const next = { ...readCheckout(), ...patch }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
  return next
}

export function clearCheckout() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
}

export const DELIVERY_LABEL: Record<string, string> = {
  pickup: 'Collect at each shelf',
  shelf_run: 'One run to my nearest shelf',
  rider: 'One run to my door',
  // Orders placed before the courier became automatic still carry this option; it is history now.
  courier: 'Courier between cities',
  taxi: 'Taxi for my whole cart',
  direct: 'Direct from seller',
}

/** Options that end at the buyer's own address, so checkout has to ask for gate and house number. */
export const DOOR_OPTIONS = ['rider', 'taxi']
/** Options that end at a shelf the buyer collects from, so checkout has to ask which shelf.
 *  A cart with an out-of-county item needs that shelf too, whatever option is picked — it is the
 *  address the inter-city leg is sent to — so checkout asks whenever the courier surcharge applies. */
export const SHELF_OPTIONS = ['shelf_run']

/** Sticky bottom bar above the mobile tabs (66px). Renders its own spacer so content is not hidden. */
export function StickyCta({ label, value, children, className }: { label: string; value: ReactNode; children: ReactNode; className?: string }) {
  return (
    <>
      <div className="h-[84px] md:hidden" />
      <div className={cx('fixed inset-x-0 bottom-[66px] z-30 flex items-center gap-3 border-t border-border bg-bg px-3.5 pb-3.5 pt-3 shadow-[0_-8px_24px_-12px_rgba(27,42,107,0.18)] md:hidden', className)}>
        <div className="flex shrink-0 flex-col">
          <span className="text-[10px] text-muted">{label}</span>
          <span className="font-head text-base font-extrabold leading-tight text-ink">{value}</span>
        </div>
        <div className="flex flex-1">{children}</div>
      </div>
    </>
  )
}

/** Compact item row used in order summaries, order cards and parcel lists. */
export function MiniItem({ image, title, sub, price, size = 34, className }: { image?: string; title: string; sub?: ReactNode; price?: number | string; size?: number; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-surface-2">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={Math.round(size * 0.38)} className="text-border-strong" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-xs font-semibold text-ink">{title}</span>
        {sub && <span className="text-[11px] text-muted">{sub}</span>}
      </div>
      {price !== undefined && <span className="shrink-0 text-xs font-bold text-ink">{typeof price === 'number' ? ksh(price) : price}</span>}
    </div>
  )
}
