import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRightLeft, Bike, Camera, Check, Home, MapPin, MessageCircle, Navigation, Package, PackageCheck, PenLine, Phone, QrCode } from 'lucide-react'
import { api, type Delivery, type Order } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, STATUS_LABEL } from '#/lib/format'
import { Avatar, Button, Chip, CodeDigits, Divider, EmptyState, PageLoading, StatusPill, cx } from '#/components/ui'
import { Thumb } from '#/components/media'
import { MapView, type MapPoint } from '#/components/map'
import { BackLink, Panel } from '#/components/dashboard'
import { OrderChat } from '#/components/order-chat'

export const Route = createFileRoute('/orders/$id/track')({ component: TrackPage })

type Track = { order: Order; delivery: Delivery | null }

const A_BASE = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold leading-none transition-colors'
const A_PRIMARY = 'border border-primary bg-primary text-white hover:bg-primary-600'
const A_OUTLINE = 'border border-border-strong bg-transparent text-ink hover:bg-surface'
const A_DISABLED = 'pointer-events-none opacity-60'

function titleFor(o: Order, d: Delivery | null): string {
  if (!d) return o.status === 'ready' ? 'Ready at shelf' : STATUS_LABEL[o.status] || `Order ${o.order_no}`
  if (d.status === 'delivered') return 'Delivered'
  if (d.status === 'on_the_way' || d.status === 'picked_up') return `Out for delivery${d.eta ? ` · arriving ${d.eta}` : ''}`
  return 'Waiting for a rider'
}

function subFor(o: Order, d: Delivery | null): string {
  if (!d) return o.shelve ? `Collect from ${o.shelve.name}${o.hold_until ? ` before ${fmtDate(o.hold_until)}` : ''}` : ''
  const last = d.events[d.events.length - 1]
  if (d.status === 'delivered') return 'Escrow has been released to the seller. Thank you for shopping with UKO.'
  if (d.status === 'on_the_way' || d.status === 'picked_up') return `${d.rider?.name || 'Your rider'} is on the way${d.distance_km ? ` · ${d.distance_km} km run` : ''}${last?.sub ? ` · ${last.sub}` : ''}`
  if (d.status === 'accepted') return `${d.rider?.name || 'A rider'} accepted and is heading to ${d.origin?.name || 'the shelf'}`
  return `Offered to riders around ${d.destination_ward || d.origin?.ward || 'your ward'} · we will notify you when one accepts`
}

function eventIcon(title: string) {
  const t = title.toLowerCase()
  if (t.includes('paid') || t.includes('reserved')) return Check
  if (t.includes('verif') || t.includes('check')) return PackageCheck
  if (t.includes('transfer') || t.includes('consolidat')) return ArrowRightLeft
  if (t.includes('picked') || t.includes('accept') || t.includes('rider')) return Bike
  if (t.includes('way') || t.includes('route')) return Navigation
  if (t.includes('deliver')) return Home
  return Package
}

function TrackPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const toast = useToast()
  const [data, setData] = useState<Track | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: `/orders/${id}/track` } })
  }, [ready, user, navigate, id])

  useEffect(() => {
    if (!user) return
    let stop = false
    let timer: ReturnType<typeof setInterval> | undefined
    const fetchIt = async () => {
      try {
        const r = await api.get<Track>(`/orders/${id}/tracking`)
        if (stop) return
        setData(r)
        setError('')
        if (r.delivery?.status === 'delivered' && timer) clearInterval(timer)
      } catch (e: any) {
        if (!stop) setError(e.message || 'Could not load tracking')
      }
    }
    fetchIt()
    timer = setInterval(fetchIt, 10000)
    return () => {
      stop = true
      if (timer) clearInterval(timer)
    }
  }, [user, id])

  if (!ready || !user) return <PageLoading />
  if (error && !data) {
    return (
      <div className="container-x py-10">
        <EmptyState icon={<Package size={28} />} title="We could not find that order" sub={error} action={<BackLink to="/orders" label="Back to my orders" />} />
      </div>
    )
  }
  if (!data) return <PageLoading />

  const { order: o, delivery: d } = data
  const rider = d?.rider || null
  const phone = rider?.phone
  const items = d?.items?.length ? d.items : o.items
  const delivered = d?.status === 'delivered'
  const pillStatus = d ? d.status : o.status
  const shelfName = d?.origin?.name || o.shelve?.name || 'the shelf'
  const shelf = d?.origin || o.shelve
  const riderCode = o.rider_code || ''
  const shelfCodeUsed = !!d && (d.status === 'picked_up' || d.status === 'on_the_way' || d.status === 'delivered')
  const barter = o.trade_type === 'barter'

  const mapsHref = shelf?.lat != null && shelf?.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${shelf.lat},${shelf.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([shelf?.name, shelf?.address, shelf?.ward].filter(Boolean).join(', '))}`

  // Riders chat from their own UKO account; one added by an admin has none, so we say so instead.
  const riderChatId = rider?.users_id || null
  const riderChatNote = rider ? `${rider.name || 'This rider'} has no UKO account to chat with — call ${rider.phone || 'the rider'} instead` : 'No rider has accepted this drop yet'

  const riderCard = (
    <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-bg p-4 md:p-5">
      <div className="flex items-center gap-3">
        <Avatar name={rider?.name || 'Rider'} src={rider?.avatar || undefined} size={46} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-[15px] font-bold">{rider ? rider.name : 'Waiting for a rider'}</h3>
          <span className="text-[11px] text-ink-2">
            {rider ? `${[rider.vehicle_type, rider.number_plate].filter(Boolean).join(' ')} · ${rider.rating || '—'} ★ · ${(rider.drops || 0).toLocaleString('en-KE')} drops` : 'Riders near the shelf have been offered this drop'}
          </span>
        </div>
        <div className="flex gap-2 md:hidden">
          <a href={phone ? `tel:${phone}` : undefined} aria-label="Call rider" className={cx('flex h-9 w-9 items-center justify-center rounded-full bg-primary-050 text-primary-600', !phone && A_DISABLED)}><Phone size={16} /></a>
          {riderChatId ? (
            <Link to={'/chat/$userId' as any} params={{ userId: String(riderChatId) } as any} search={{ item: items[0]?.item_id } as any} aria-label="Message rider" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-050 text-primary-600"><MessageCircle size={16} /></Link>
          ) : (
            <button type="button" aria-label="Message rider" onClick={() => toast.toast(riderChatNote)} className={cx('flex h-9 w-9 items-center justify-center rounded-full bg-primary-050 text-primary-600', A_DISABLED)}><MessageCircle size={16} /></button>
          )}
        </div>
      </div>
      <div className="hidden grid-cols-2 gap-2 md:grid">
        <a href={phone ? `tel:${phone}` : undefined} className={cx(A_BASE, A_PRIMARY, 'px-3.5 py-[11px] text-[13px]', !phone && A_DISABLED)}><Phone size={14} /> Call</a>
        {riderChatId ? (
          <Link to={'/chat/$userId' as any} params={{ userId: String(riderChatId) } as any} search={{ item: items[0]?.item_id } as any} className={cx(A_BASE, A_OUTLINE, 'px-3.5 py-[11px] text-[13px]')}><MessageCircle size={14} /> Message</Link>
        ) : (
          <Button variant="outline" size="sm" className="!py-[11px]" onClick={() => toast.toast(riderChatNote)}><MessageCircle size={14} /> Message</Button>
        )}
      </div>
    </div>
  )

  const parcelCard = (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4 md:p-5">
      <h3 className="text-[15px] font-bold">{d ? 'In this delivery' : 'In this order'}</h3>
      <div className="flex flex-col gap-2.5">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2.5">
            <Thumb src={it.image} size={36} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{it.title}</span>
            <span className="text-[11px] text-muted">×{it.quantity}</span>
          </div>
        ))}
      </div>
      <Divider />
      <div className="flex flex-col gap-2">
        {d ? (
          <>
            <Row label="Delivery from" value={d.origin?.name || '—'} />
            <Row label="Deliver to" value={d.destination || [o.estate, o.house, o.ward].filter(Boolean).join(', ') || '—'} />
            <Row label="Window" value={d.window_start || d.window_end ? `${d.window_start || '—'} – ${d.window_end || '—'}` : '—'} />
            <Row label="Delivery fee" value={`${ksh(d.fee)}${o.payment_status === 'paid' ? ' (paid)' : ''}`} />
            <Row label="Rider notes" value={d.buyer?.notes || o.notes || '—'} />
          </>
        ) : (
          <>
            <Row label="Collect from" value={o.shelve?.name || '—'} />
            <Row label="Address" value={[o.shelve?.address, o.shelve?.ward].filter(Boolean).join(', ') || '—'} />
            <Row label="Hours" value={o.shelve ? `${o.shelve.opening_time} – ${o.shelve.closing_time}` : '—'} />
            <Row label="Claim before" value={o.hold_until ? fmtDate(o.hold_until) : '—'} />
            <Row label="Order total" value={ksh(o.total)} />
          </>
        )}
      </div>
    </div>
  )

  const supportCard = (
    <div className="flex flex-col gap-2.5 rounded-lg border border-warning/20 bg-warning-050 p-4 md:p-5">
      <h3 className="text-[15px] font-bold">Something wrong?</h3>
      <p className="m-0 text-[11px] leading-[1.55] text-ink-2">If the parcel is damaged, incomplete or never arrives, report it within 24 hours and escrow is held until it's resolved.</p>
      <Button variant="outline" size="sm" full className="!py-[11px]" onClick={() => toast.success('Dispute opened — escrow stays on hold while our team reviews it')}>Open dispute</Button>
    </div>
  )

  return (
    <div className="container-x flex flex-col gap-4 py-4 pb-24 md:gap-[18px] md:py-7 md:pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <BackLink to="/orders" label="My orders" />
              <span className="text-muted">·</span>
              <span className="text-muted">Order {o.order_no}</span>
              {barter && <Chip size="sm" tone="secondary"><ArrowRightLeft size={11} /> Barter trade</Chip>}
            </div>
            <span className="md:hidden"><StatusPill status={pillStatus} label={STATUS_LABEL[pillStatus]} /></span>
          </div>
          <h1 className="text-xl leading-tight md:text-[26px]">{titleFor(o, d)}</h1>
          {subFor(o, d) && <p className="m-0 text-[11px] text-ink-2 md:text-[13px]">{subFor(o, d)}</p>}
        </div>
        {d && (
          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1 md:flex-none" disabled={delivered} onClick={() => toast.toast('Reschedule requests are sent to the rider by SMS — we will confirm the new window shortly')}>Reschedule</Button>
            <a href={phone ? `tel:${phone}` : undefined} className={cx(A_BASE, A_PRIMARY, 'flex-1 px-[22px] py-[13px] text-sm md:flex-none', !phone && A_DISABLED)}><Phone size={15} /> Call rider</a>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_380px] md:gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          {d ? (
            <>
              <MapView
                line
                follow="rider"
                height={280}
                className="!rounded-lg"
                points={([
                  d.origin && { id: 'shelf', lat: d.origin.lat, lng: d.origin.lng, label: `Shelf · ${d.origin.name || shelfName}`, tone: 'primary' },
                  // Only once he has actually been located — an absent rider must not appear parked at the shelf.
                  d.rider_lat != null && d.rider_lng != null && { id: 'rider', lat: d.rider_lat, lng: d.rider_lng, label: rider ? `Rider · ${rider.name.split(' ')[0]}` : 'Rider', tone: 'secondary' },
                  d.dest_lat != null && d.dest_lng != null && { id: 'you', lat: d.dest_lat, lng: d.dest_lng, label: 'You', tone: 'success' },
                ].filter(Boolean) as MapPoint[])}
                hint={d.rider_lat == null ? 'Your rider appears here once he picks the parcel up' : undefined}
              />
              <div className="md:hidden">{riderCard}</div>

              <Panel title="Delivery timeline" action={<span className="text-[11px] text-muted">Tracking ID {d.tracking_no}</span>} padded={false}>
                {d.events.length === 0 && (
                  <div className="px-4 py-4 text-[13px] text-ink-2 md:px-[18px]">No updates yet — the shelf will confirm your parcel shortly.</div>
                )}
                {d.events.map((ev, i) => {
                  const Icon = eventIcon(ev.title)
                  const current = !delivered && i === d.events.length - 1
                  return (
                    <div key={i} className={cx('flex items-start gap-3 border-b border-border px-4 py-3 md:gap-3.5 md:px-[18px] md:py-3.5', current && 'bg-primary-050')}>
                      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', current ? 'bg-primary text-white' : 'bg-success-050 text-success')}><Icon size={15} /></span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[13px] font-bold text-ink">{ev.title}</span>
                        {ev.sub && <span className="text-[11px] leading-[1.5] text-ink-2">{ev.sub}</span>}
                      </div>
                      <span className={cx('w-[74px] shrink-0 text-right text-[11px] md:w-[110px]', current ? 'font-bold text-primary-600' : 'text-muted')}>{current ? 'Now' : fmtDate(ev.time)}</span>
                    </div>
                  )
                })}
                {!delivered && (
                  <div className="flex items-start gap-3 px-4 py-3 md:gap-3.5 md:px-[18px] md:py-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><Home size={15} /></span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[13px] font-bold text-muted">Delivered</span>
                      <span className="text-[11px] leading-[1.5] text-ink-2">Confirm with the 4-digit code or signature</span>
                    </div>
                    <span className="w-[74px] shrink-0 text-right text-[11px] text-muted md:w-[110px]">{d.eta ? `ETA ${d.eta}` : 'ETA —'}</span>
                  </div>
                )}
              </Panel>

              <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-bg p-4 md:p-5">
                <h3 className="text-[15px] font-bold">Confirm delivery</h3>
                <p className="m-0 text-xs leading-[1.55] text-ink-2">Your rider code — give it to the rider only after checking the parcel. Escrow releases to the seller once it is entered.</p>
                <div className="flex flex-col gap-3.5 md:flex-row md:items-center">
                  <CodeDigits value={riderCode} length={riderCode.length || 4} size="lg" />
                  <div className="flex flex-1 flex-col gap-2">
                    <span className="flex items-center gap-2 text-[11px] text-ink-2"><PenLine size={14} className="text-muted" /> Or sign on the rider's phone</span>
                    <span className="flex items-center gap-2 text-[11px] text-ink-2"><Camera size={14} className="text-muted" /> Rider captures a photo at the door</span>
                  </div>
                  <Button variant="outline" size="sm" className="!py-[11px]" onClick={() => toast.success('Report received — a UKO agent will call you within the hour')}>Report a problem</Button>
                </div>
                {shelfCodeUsed && o.shelve_code && (
                  <span className="flex items-center gap-2 text-[11px] text-ink-2"><PackageCheck size={14} className="text-success" /> Shelf code {o.shelve_code} was used at the shelf hand-over</span>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-bg p-4 md:p-5">
              <h3 className="text-[15px] font-bold">Claim at the shelf</h3>
              <p className="m-0 text-xs leading-[1.55] text-ink-2">This order is a shelf pickup — there is no rider to track. Show the code below with your national ID and the shelf releases your item; escrow then pays the seller.</p>
              <div className="flex items-center gap-[11px] rounded-md bg-success-050 p-3">
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[6px] bg-bg text-ink"><QrCode size={24} /></span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-head text-[13px] font-extrabold text-success">Claim code {o.claim_code || '—'}</span>
                  <span className="text-[10px] leading-[1.4] text-ink-2">Show this and your national ID at {shelfName}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a href={mapsHref} target="_blank" rel="noreferrer" className={cx(A_BASE, A_PRIMARY, 'px-3.5 py-[11px] text-[13px]')}><MapPin size={14} /> Get directions</a>
                <a href={o.shelve?.contact_phone ? `tel:${o.shelve.contact_phone}` : undefined} className={cx(A_BASE, A_OUTLINE, 'px-3.5 py-[11px] text-[13px]', !o.shelve?.contact_phone && A_DISABLED)}><Phone size={14} /> Call shelf</a>
              </div>
            </div>
          )}
          <OrderChat order={o} viewer="buyer" />
          <div className="md:hidden">{parcelCard}</div>
          <div className="md:hidden">{supportCard}</div>
        </div>

        <aside className="hidden flex-col gap-4 md:flex">
          {d && riderCard}
          {parcelCard}
          {supportCard}
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="w-[80px] shrink-0 text-ink-2 md:w-[110px]">{label}</span>
      <span className="text-right font-semibold leading-[1.45] text-ink">{value}</span>
    </div>
  )
}
