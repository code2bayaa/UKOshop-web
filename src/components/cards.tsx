/** Card / Product, Card / Shelf and horizontal scroll rows from the wireframe. */
import { useRef, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Clock, ImageIcon, Store } from 'lucide-react'
import type { ItemCard, Shelve } from '#/lib/api'
import { ksh, priceRange } from '#/lib/format'
import { Chip, LinkButton, Stars, VerifiedBadge, cx } from './ui'

export function ProductCard({ item, className, compact }: { item: ItemCard; className?: string; compact?: boolean }) {
  return (
    <Link to="/items/$id" params={{ id: String(item.id) }} className={cx('group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-bg transition-shadow hover:shadow-card', className)}>
      <div className={cx('relative flex items-center justify-center overflow-hidden bg-surface-2', compact ? 'h-[140px]' : 'h-[168px]')}>
        {item.image ? <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <ImageIcon size={34} className="text-border-strong" />}
        {item.boosted && <Chip size="sm" tone="secondary" className="absolute left-2 top-2">Boosted</Chip>}
        {item.status === 'sold_out' && <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[11px] font-semibold text-white">Sold out</span>}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5">
          {item.is_verified ? <VerifiedBadge /> : <Chip size="sm" tone="warning">{item.on_shelve ? 'On shelf' : 'Seller direct'}</Chip>}
          {item.barter_enabled && <Chip size="sm" tone="primary">Barter</Chip>}
          <span className="truncate text-[11px] text-muted">{item.shelve_name || item.ward}</span>
        </div>
        <p className="line-clamp-2 m-0 h-[38px] text-[13px] leading-[1.4] text-ink">{item.title}</p>
        <Stars value={item.rating} count={item.rating_count} />
        <p className="m-0 font-head text-base font-extrabold text-ink">{priceRange(item.min_amount, item.max_amount)}</p>
        <div className="flex items-center gap-2 text-[11px]">
          {item.old_amount ? <span className="text-muted line-through">{ksh(item.old_amount)}</span> : null}
          <span className="text-success">{item.sold_count} sold</span>
        </div>
      </div>
    </Link>
  )
}

export function ShelfCard({ shelve, className, primaryLabel = 'Browse items', secondaryLabel = 'Get directions' }: { shelve: Shelve; className?: string; primaryLabel?: string; secondaryLabel?: string }) {
  const pct = shelve.capacity_used_pct ?? 0
  return (
    <div className={cx('flex w-full flex-col overflow-hidden rounded-lg border border-border bg-bg', className)}>
      <div className="flex h-[128px] items-center justify-center bg-surface-2">
        {shelve.image ? <img src={shelve.image} alt={shelve.name} loading="lazy" className="h-full w-full object-cover" /> : <Store size={30} className="text-border-strong" />}
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h3 className="truncate text-[15px] font-bold">{shelve.name}</h3>
            <span className="truncate text-xs text-ink-2">{shelve.ward} ward · {shelve.county}</span>
          </div>
          {shelve.status === 'live' ? <VerifiedBadge label={shelve.is_open ? 'Open' : 'Closed'} /> : <Chip size="sm" tone="warning">{shelve.status.replace('_', ' ')}</Chip>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['Storage', 'Free'], ['Delivery', ksh(shelve.delivery_fee)], ['Capacity', `${pct}%`]].map(([l, v]) => (
            <div key={l} className="flex flex-col gap-[3px] rounded-sm bg-surface px-2.5 py-[9px]">
              <span className="text-[10px] text-muted">{l}</span>
              <span className="text-[13px] font-bold">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-2">
          <Clock size={13} className="text-muted" />
          <span className="truncate">Mon–Sat · {shelve.opening_time} – {shelve.closing_time} · {shelve.contact_phone}</span>
        </div>
        <div className="flex gap-2">
          <LinkButton to="/shelves/$id" params={{ id: String(shelve.id) }} size="sm" full>{primaryLabel}</LinkButton>
          <a href={shelve.lat && shelve.lng ? `https://www.google.com/maps?q=${shelve.lat},${shelve.lng}` : '#'} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center rounded-md border border-border-strong px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-surface">{secondaryLabel}</a>
        </div>
      </div>
    </div>
  )
}

/** Group row: title + "More items" + arrows, then an overflow-x scroll row. */
export function ScrollRow({ title, sub, more, children, className }: { title: ReactNode; sub?: ReactNode; more?: { to: string; search?: any; label?: string }; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: 'smooth' })
  return (
    <section className={cx('flex flex-col gap-4', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3 md:gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl md:text-2xl">{title}</h2>
            {sub && <p className="m-0 text-[13px] text-ink-2">{sub}</p>}
          </div>
          {more && (
            <Link to={more.to as any} search={more.search} className="mb-0.5 inline-flex items-center rounded-md border border-border-strong px-[15px] py-2 text-[13px] font-semibold text-ink hover:bg-surface">{more.label || 'More items'}</Link>
          )}
        </div>
        <div className="hidden gap-1.5 md:flex">
          <button type="button" onClick={() => scroll(-1)} aria-label="Scroll left" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg text-ink-2 hover:bg-surface"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => scroll(1)} aria-label="Scroll right" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg text-ink-2 hover:bg-surface"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:gap-4 md:px-0">
        {children}
      </div>
      <div className="h-1 w-full rounded-full bg-surface-2"><div className="h-full w-1/4 rounded-full bg-border-strong" /></div>
    </section>
  )
}

export function ProductSlot({ children }: { children: ReactNode }) {
  return <div className="w-[60%] shrink-0 snap-start sm:w-[45%] md:w-[232px]">{children}</div>
}
