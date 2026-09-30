/**
 * ItemReturnDialog — getting an item back off a shelf (PRD 14, API app/returns.py).
 *
 * The seller opens this from the ads table. It asks the API what this particular item may do, shows every
 * answer including the ones it cannot — an option that is refused keeps its place in the list with the reason
 * written on it, because "a rider will bring it home in 5 more days" is a useful sentence and a missing row is
 * not — and then charges once for whichever he picks.
 *
 * Two shapes of decision, and the API decides which one this item is in:
 *
 *   the shelf is in his county   collect it himself · keep it there on a fresh stay · a rider to his door
 *   the shelf is somewhere else  collect it himself · keep it there · a courier back to his own shelf ·
 *                                a courier to a shelf near him and then a rider the last mile
 *
 * Nothing on this screen decides a price. The fee shown is what the API quoted for the pin and vehicle it was
 * given, and the API measures and prices the whole thing again when the seller commits — a total that has
 * moved in between is refused rather than charged, exactly as the post-ad payment step behaves.
 */
import { useCallback, useEffect, useState } from 'react'
import { Bike, Car, CalendarClock, Check, Crosshair, Info, MapPin, Package, Store, Truck, User as UserIcon, X } from 'lucide-react'
import { api, type ItemReturn, type PayableWallet, type ReturnMode, type ReturnOption, type ReturnOptions } from '#/lib/api'
import { ksh } from '#/lib/format'
import { Button, Chip, Input, Notice, Radio, Spinner, cx } from '#/components/ui'
import { MapView, type MapPoint } from '#/components/map'
import { MpesaPending, type MpesaPayment } from '#/components/mpesa-pending'
import { PAY_BY_MPESA, PayWith, canPay, usePayableWallets, type PayChoice } from '#/components/pay-with'
import { newSocketKey } from '#/lib/sockets'

/** The modes that end at the seller's own door, and therefore need a pin before they can be priced. */
const NEEDS_PIN: ReturnMode[] = ['rider', 'courier_rider']
/** The modes that put the item on a vehicle the seller chooses. */
const NEEDS_VEHICLE: ReturnMode[] = ['rider', 'courier_rider']

const MODE_ICON: Record<ReturnMode, typeof Package> = {
  self: UserIcon,
  reshelve: Store,
  rider: Bike,
  shelf_transfer: Truck,
  courier_rider: Car,
}
const VEHICLE_ICON: Record<string, typeof Bike> = { bicycle: Bike, motorbike: Bike, tuktuk: Car, pickup: Truck, truck: Truck }

type Result = { item: any; return: ItemReturn; charges: { lines: any[]; total: number }; return_payment: MpesaPayment | null }

export function ItemReturnDialog({ itemId, title, shelfName, onClose, onDone }: {
  itemId: number
  title: string
  shelfName: string
  onClose: () => void
  onDone: () => void
}) {
  const [data, setData] = useState<ReturnOptions | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<ReturnMode | null>(null)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [address, setAddress] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [pay, setPay] = useState<PayChoice>(PAY_BY_MPESA)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [pending, setPending] = useState<MpesaPayment | null>(null)
  const [done, setDone] = useState<ItemReturn | null>(null)
  const wallets: PayableWallet[] = usePayableWallets(true)

  /** Re-ask the API every time the pin or the vehicle changes: it is the only thing that knows the price. */
  const load = useCallback(async () => {
    setError('')
    try {
      const q = new URLSearchParams()
      if (pin) { q.set('lat', String(pin.lat)); q.set('lng', String(pin.lng)) }
      if (vehicle) q.set('vehicle', vehicle)
      const r = await api.get<ReturnOptions>(`/seller/items/${itemId}/return-options${q.toString() ? `?${q}` : ''}`)
      setData(r)
    } catch (e: any) {
      setError(e.message)
    }
  }, [itemId, pin, vehicle])

  useEffect(() => { void load() }, [load])

  const picked: ReturnOption | null = data && mode ? data.options.find((o) => o.key === mode) ?? null : null
  const needsPin = !!mode && NEEDS_PIN.includes(mode) && !pin
  const total = picked?.fee ?? 0
  const affordable = canPay(pay, wallets, total)
  const ready = !!picked && picked.available && !needsPin && (total <= 0 || affordable)

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('This browser cannot share your location — tap the map instead.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setPin({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false) },
      () => { setError('We could not read your location — tap your spot on the map instead.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const submit = async () => {
    if (!picked || !mode) return
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = { mode, dest_address: address.trim(), vehicle: picked.vehicle || vehicle }
      if (pin) { body.dest_lat = pin.lat; body.dest_lng = pin.lng }
      if (total > 0) body.payment = { ...pay, total, socket_key: newSocketKey() }
      const r = await api.post<Result>(`/seller/items/${itemId}/return`, body)
      // A wallet (or the simulated gateway) settles on the spot; a live STK push has to be waited for.
      if (r.return_payment && r.return.status === 'pending_payment') setPending(r.return_payment)
      else { setDone(r.return); onDone() }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- the M-PESA wait, and the receipt
  if (pending) {
    return (
      <Shell title="Waiting for your M-PESA PIN" onClose={onClose}>
        <MpesaPending
          payment={pending}
          title={`${ksh(pending.amount_ksh)} to send "${title}" home`}
          onApproved={async () => { setPending(null); onDone(); await load(); setDone(data?.current ?? null) }}
          onFailed={(m) => { setPending(null); setError(m) }}
        />
      </Shell>
    )
  }
  if (done) {
    const legs = done.legs ?? []
    return (
      <Shell title="On its way home" onClose={onClose}>
        <div className="flex flex-col gap-3">
          <Notice tone="success" icon={<Check size={15} />} title={`${done.return_no} · ${done.label}`}>
            {done.status === 'delivered'
              ? done.mode === 'reshelve'
                ? `"${title}" keeps its place on ${done.from_shelve || shelfName}, verified and on sale.`
                : `"${title}" is yours to collect from ${done.from_shelve || shelfName}. It is off the shelf and no longer verified, so buyers order it from you directly until you send it to a shelf again.`
              : `We have it. Follow it on your ads list — you will be told at every hand-over.`}
          </Notice>
          {legs.map((l) => (
            <div key={l.no} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3">
              <span className="flex items-center justify-between gap-2 text-[13px] font-bold">
                <span className="flex items-center gap-1.5">{l.type === 'rider' ? <Bike size={14} className="text-primary" /> : <Truck size={14} className="text-primary" />} {l.no}</span>
                <Chip size="sm" tone="neutral">{l.status}</Chip>
              </span>
              {l.seller_code && (
                <span className="text-xs text-ink-2">
                  Your code is <b className="font-head tracking-[0.2em] text-ink">{l.seller_code}</b> — give it to the rider
                  <b> only</b> when the item is actually in your hands.
                </span>
              )}
            </div>
          ))}
          <Button full onClick={onClose}>Done</Button>
        </div>
      </Shell>
    )
  }

  // ---------------------------------------------------------------- choosing
  return (
    <Shell title={`Get "${title}" back`} onClose={onClose}>
      {!data ? (
        <div className="flex items-center gap-2 py-6 text-sm text-ink-2"><Spinner className="h-4 w-4" /> Working out what this item can do…</div>
      ) : data.current ? (
        <Notice tone="info" icon={<Info size={15} />} title={`Already coming home on ${data.current.return_no}`}>
          {data.current.label}. Wait for it to finish, or cancel it from your ads list first.
        </Notice>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <Chip size="sm" tone={data.same_county ? 'success' : 'warning'}>
              {data.same_county ? `On ${data.shelve}, in your county` : `On ${data.shelve} — ${data.shelve_county}, not ${data.seller_county || 'your county'}`}
            </Chip>
            <Chip size="sm">Idle {data.idle_days} day{data.idle_days === 1 ? '' : 's'}</Chip>
          </div>

          <div className="flex flex-col gap-2">
            {data.options.map((o) => {
              const Icon = MODE_ICON[o.key] ?? Package
              const on = mode === o.key
              // An option that is only waiting for a pin stays clickable: the map that asks for the pin
              // lives below, and it opens when the option is picked. Disable it and the seller can never
              // reach the very thing that would make it available.
              const pickable = o.available || !!o.needs_pin
              return (
                <button
                  key={o.key} type="button" disabled={!pickable}
                  onClick={() => { setMode(o.key); setVehicle(o.vehicle || '') }}
                  className={cx('flex flex-col gap-1 rounded-md border p-3 text-left transition-colors',
                    !pickable ? 'cursor-not-allowed border-border bg-surface-2 opacity-70'
                      : on ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}
                >
                  <span className="flex items-center gap-2">
                    <Radio checked={on} />
                    <Icon size={15} className="shrink-0 text-primary" />
                    <span className="truncate text-[13px] font-bold">{o.label}</span>
                    <span className={cx('ml-auto shrink-0 text-[13px] font-bold', o.fee > 0 ? 'text-secondary' : 'text-success')}>
                      {o.available ? (o.fee > 0 ? ksh(o.fee) : 'Free') : o.needs_pin ? 'Needs your pin' : '—'}
                    </span>
                  </span>
                  <span className="pl-[26px] text-xs text-ink-2">{o.available || o.needs_pin ? o.sub : o.reason}</span>
                </button>
              )
            })}
          </div>

          {/* Where it is going. Only the two that end at a doorstep need this, and neither can be priced without it. */}
          {mode && NEEDS_PIN.includes(mode) && (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-bold">Where should it be brought?</span>
                <Button type="button" size="sm" variant="outline" loading={locating} icon={<Crosshair size={14} />} onClick={useMyLocation}>
                  {pin ? 'Update my location' : 'Use my current location'}
                </Button>
              </div>
              <Input label="Drop-off address" placeholder="Gate, house number, the things a pin does not say"
                     value={address} onChange={(e) => setAddress(e.target.value)}
                     hint={pin ? `Pinned at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : 'Tap the map, or share your location, to put a pin on it'} />
              <MapView points={returnPoints(pin, data)} line={!!pin && data.shelve_lat != null} pick height={200}
                       onPick={(lat, lng) => setPin({ lat, lng })}
                       hint={picked?.rider_km || picked?.distance_km ? `${picked.rider_km || picked.distance_km} km on the leg to you` : undefined} />
              {!pin && (
                <Notice tone="warning" icon={<MapPin size={15} />} title="Drop a pin to see the price">
                  The fee is the distance from the shelf to you, so we have to know where you are.
                </Notice>
              )}
            </div>
          )}

          {/* Which vehicle carries it. Same rate card as the trip out, because it is the same road. */}
          {mode && NEEDS_VEHICLE.includes(mode) && pin && !!picked?.vehicles?.length && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink-2">Which vehicle brings it?</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {picked.vehicles.map((v) => {
                  const Icon = VEHICLE_ICON[v.key] ?? Truck
                  const on = (picked.vehicle || vehicle) === v.key
                  return (
                    <button key={v.key} type="button" disabled={!v.available} onClick={() => setVehicle(v.key)}
                            className={cx('flex flex-col gap-1 rounded-md border p-3 text-left transition-colors',
                              !v.available ? 'cursor-not-allowed border-border bg-surface-2 opacity-60'
                                : on ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}>
                      <span className="flex items-center gap-2">
                        <Radio checked={on} />
                        <Icon size={15} className="shrink-0 text-primary" />
                        <span className="truncate text-[13px] font-bold">{v.name}</span>
                      </span>
                      <span className="text-xs text-ink-2">{v.available ? `${v.desc} · about ${v.eta_minutes} min` : v.reason}</span>
                      <span className={cx('text-xs font-semibold', v.available ? 'text-primary' : 'text-muted')}>{ksh(v.fee)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* What it costs, line by line — one bill even when it is two legs. */}
          {!!picked?.lines?.length && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3.5">
              {picked.lines.map((l) => (
                <div key={l.key} className="flex items-start justify-between gap-3 text-xs">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-ink">{l.label}</span>
                    <span className="text-muted">{l.detail}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-ink">{ksh(l.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <span className="text-[13px] font-bold">Total</span>
                <span className="font-head text-base font-extrabold text-secondary">{ksh(total)}</span>
              </div>
            </div>
          )}

          {total > 0 && <PayWith amount={total} wallets={wallets} value={pay} onChange={setPay} />}

          {mode === 'reshelve' && picked?.available && (
            <Notice tone="success" icon={<CalendarClock size={15} />} title="Nothing moves and nothing is charged">
              The shelf keeps it for another {data.free_storage_days} days and it stays verified and on sale.
              {typeof picked.slots_free === 'number' && ` ${picked.slots_free} slot${picked.slots_free === 1 ? '' : 's'} free there.`}
            </Notice>
          )}

          {error && <Notice tone="danger" icon={<Info size={15} />}>{error}</Notice>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" variant={total > 0 ? 'secondary' : 'primary'} loading={busy} disabled={!ready} onClick={submit}>
              {!mode ? 'Choose a way home' : total > 0 ? `Pay ${ksh(total)}` : 'Confirm'}
            </Button>
          </div>
        </div>
      )}
      {!data && error && <Notice tone="danger" icon={<Info size={15} />}>{error}</Notice>}
    </Shell>
  )
}

/**
 * The two ends of the trip: the shelf that has the item, and the pin the seller wants it brought to. His own
 * pin is draggable, because nudging it is how he corrects a location the browser guessed badly.
 */
function returnPoints(pin: { lat: number; lng: number } | null, data: ReturnOptions): MapPoint[] {
  const out: MapPoint[] = []
  if (data.shelve_lat != null && data.shelve_lng != null) {
    out.push({ id: 'shelf', lat: data.shelve_lat, lng: data.shelve_lng, label: data.shelve, tone: 'secondary' })
  }
  if (pin) out.push({ id: 'me', lat: pin.lat, lng: pin.lng, label: 'You', tone: 'primary', draggable: true })
  return out
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="fade-up max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-t-lg bg-bg p-5 shadow-card sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="truncate text-base font-bold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-2 hover:bg-surface"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
