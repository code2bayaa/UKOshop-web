/** Shelf detail — /shelves/$id */
import { createFileRoute, Link } from '@tanstack/react-router'
import { BadgeCheck, Clock, Mail, MapPin, Navigation, Package, PackageSearch, Phone, Store, User } from 'lucide-react'
import { publicGet, type ItemCard, type Shelve } from '#/lib/api'
import { ksh } from '#/lib/format'
import { ProductCard } from '#/components/cards'
import { MapView } from '#/components/map'
import { Breadcrumbs, Chip, EmptyState, KeyValue, LinkButton, ProgressBar, VerifiedBadge } from '#/components/ui'

type ShelfDetail = Shelve & { items: ItemCard[] }

export const Route = createFileRoute('/shelves/$id')({
  loader: ({ params }) => publicGet<ShelfDetail>('/shelves/' + params.id),
  component: ShelfPage,
})

function ShelfPage() {
  const s = Route.useLoaderData()
  const pct = s.capacity_used_pct ?? 0
  const itemsCount = s.items_count ?? s.items.length
  const slotsFree = s.slots_free ?? Math.max(0, s.capacity - itemsCount)
  const mapsUrl = s.lat && s.lng ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address} ${s.ward}`)}`
  const capTone = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'primary'

  return (
    <div className="flex flex-col pb-6">
      <div className="w-full border-b border-border bg-surface">
        <div className="container-x flex h-[46px] items-center"><Breadcrumbs crumbs={[{ name: 'Home', href: '/' }, { name: 'Shelves', href: '/shelves' }, { name: s.name, href: '#' }]} /></div>
      </div>

      <div className="container-x flex flex-col gap-8 pt-5 md:gap-10 md:pt-7">
        {/* Header card */}
        <section className="overflow-hidden rounded-lg border border-border bg-bg">
          <div className="grid md:grid-cols-[360px_1fr]">
            <div className="flex h-[200px] items-center justify-center bg-surface-2 md:h-full md:min-h-[300px]">
              {s.image ? <img src={s.image} alt={s.name} className="h-full w-full object-cover" /> : <Store size={44} className="text-border-strong" />}
            </div>
            <div className="flex flex-col gap-5 p-5 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.status === 'live' ? <VerifiedBadge label="Verified shelf" /> : <Chip size="sm" tone="warning">{s.status.replace(/_/g, ' ')}</Chip>}
                    <Chip size="sm" tone={s.is_open ? 'success' : 'neutral'}>{s.is_open ? 'Open now' : 'Closed now'}</Chip>
                    {s.relocating_date && <Chip size="sm" tone="warning">Relocating</Chip>}
                  </div>
                  <h1 className="text-[24px] leading-tight md:text-[28px]">{s.name}</h1>
                  <p className="m-0 flex items-center gap-1.5 text-sm text-ink-2"><MapPin size={14} className="shrink-0 text-muted" /> {s.ward} ward · {s.county}{s.address ? ` · ${s.address}` : ''}</p>
                  {s.landmark && <p className="m-0 text-xs text-muted">Landmark: {s.landmark}</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[['Storage', 'Free'], ['Delivery', ksh(s.delivery_fee)], ['Slots free', `${slotsFree} of ${s.capacity}`]].map(([l, v]) => (
                  <div key={l} className="flex flex-col gap-[3px] rounded-sm bg-surface px-2.5 py-[9px]">
                    <span className="text-[10px] text-muted">{l}</span>
                    <span className="font-head text-[13px] font-bold">{v}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-2">Capacity used</span>
                  <span className="font-semibold text-ink">{pct}% · {itemsCount} items</span>
                </div>
                <ProgressBar value={pct} tone={capTone} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-md border border-border p-3.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink"><Clock size={13} className="text-muted" /> Opening hours</span>
                  <KeyValue label="Mon – Sat" value={`${s.opening_time} – ${s.closing_time}`} />
                  <KeyValue label="Sunday" value={s.open_sunday ? s.sunday_hours || 'Open' : 'Closed'} />
                </div>
                <div className="flex flex-col gap-2 rounded-md border border-border p-3.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink"><Phone size={13} className="text-muted" /> Contact</span>
                  {s.contact_phone && <a href={`tel:${s.contact_phone}`} className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:text-primary"><Phone size={12} className="text-muted" /> {s.contact_phone}</a>}
                  {s.contact_email && <a href={`mailto:${s.contact_email}`} className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink hover:text-primary"><Mail size={12} className="shrink-0 text-muted" /> <span className="truncate">{s.contact_email}</span></a>}
                  {s.extra_contacts?.map((c) => <span key={c.label + c.value} className="text-[13px] text-ink-2">{c.label}: <span className="font-medium text-ink">{c.value}</span></span>)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2">
                <span className="flex items-center gap-1.5"><User size={13} className="text-muted" /> Host: <span className="font-medium text-ink">{s.owner_name}</span></span>
                {s.licence && <span className="flex items-center gap-1.5"><BadgeCheck size={13} className="text-success" /> Licence <span className="font-medium text-ink">{s.licence}</span></span>}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border-strong px-[22px] py-[13px] text-sm font-semibold text-ink hover:bg-surface sm:w-auto"><Navigation size={15} /> Get directions</a>
                <LinkButton to={'/post-ad' as any} icon={<Package size={15} />} className="w-full sm:w-auto">Drop an item here</LinkButton>
              </div>
            </div>
          </div>
        </section>

        {/* Map */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl md:text-2xl">Where to find it</h2>
            <p className="m-0 text-[13px] text-ink-2">{s.address || `${s.ward} ward`}{s.landmark ? ` · near ${s.landmark}` : ''}{s.lat && s.lng ? ` · ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : ''}</p>
          </div>
          <MapView points={[{ id: 'shelf', lat: s.lat, lng: s.lng, label: s.name, tone: 'primary' }]} height={280} />
        </section>

        {/* Items on this shelf */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl md:text-2xl">Items on this shelf</h2>
              <p className="m-0 text-[13px] text-ink-2">Verified by the shelf host and ready to pick up or deliver from {s.ward}.</p>
            </div>
            {s.items.length > 0 && <Link to="/items" search={{ shelve: s.id } as any} className="inline-flex items-center rounded-md border border-border-strong px-[15px] py-2 text-[13px] font-semibold text-ink hover:bg-surface">All items here</Link>}
          </div>
          {s.items.length === 0 ? (
            <EmptyState icon={<PackageSearch size={28} />} title="Nothing on this shelf yet" sub="Be the first seller to drop an item here — it goes live once the host verifies it." action={<LinkButton to={'/post-ad' as any} size="sm">Post an ad</LinkButton>} />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
              {s.items.map((i) => <ProductCard key={i.id} item={i} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
