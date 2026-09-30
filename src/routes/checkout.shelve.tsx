import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Bike, Car, Clock, LocateFixed, Package, ShoppingCart, Store, Truck, type LucideIcon } from 'lucide-react'
import { api, type Shelve } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useCart } from '#/lib/cart'
import { useToast } from '#/lib/toast'
import { ksh } from '#/lib/format'
import { Button, CheckoutStepper, Chip, Divider, EmptyState, Input, KeyValue, LinkButton, PageLoading, Radio, Select, Textarea, cx } from '#/components/ui'
import { MapView, type MapPoint } from '#/components/map'
import { DOOR_OPTIONS, MiniItem, SHELF_OPTIONS, StickyCta, readCheckout, writeCheckout } from '#/components/checkout'

type Search = { funds?: boolean; account?: boolean; sms?: boolean }
type ShelfOption = Shelve & { cart_items: number; distance_km: number | null }
/** `detail` carries whatever the option was priced on: the route and the vehicle for a run. It is what
 *  lets the fee explain itself instead of being a bare number. */
type OptionDetail = {
  vehicle?: string; vehicle_name?: string; stops?: number[]; saving?: number; per_shelf?: number
  separate_fee?: number
  to_shelve_id?: number | null; to_shelve_name?: string; to_shelve_ward?: string
}
/** `fee` is what this option costs in total. `own_fee` is the trip itself and `courier_fee` the
 *  inter-city legs the buyer had no say in — the same number on every option, shown once as a line. */
type DeliveryOption = {
  key: string; title: string; sub: string; fee: number; own_fee: number; courier_fee: number
  available: boolean; distance_km: number | null; detail: OptionDetail
}
/** One inter-city leg: a shelf outside the buyer's county sending its share of the cart to the shelf
 *  he collects at. Priced by distance, weight and the item's category (shop/back-end/app/courier.py). */
type CourierLeg = {
  from_shelve_id: number; from_shelve_name: string; from_county: string
  to_shelve_name: string; to_county: string; weight_kg: number; categories: string[]
  class_name: string; distance_km: number | null; days: string; fee: number; available: boolean; sub: string
}
type CourierSurcharge = {
  fee: number; available: boolean; required: boolean; legs: CourierLeg[]; counties: string[]
  partner?: string; sub: string; reason: string
}
type CollectShelf = Shelve & { distance_km: number | null }
type Options = {
  shelves: ShelfOption[]; delivery_options: DeliveryOption[]; courier: CourierSurcharge; wards_live: number
  shelves_per_ward: number; weight_kg: number; collect_at: CollectShelf | null
}
type Pin = { lat: number; lng: number }
/** GET /wards — the address suggestions behind the Country / County / Ward selects. */
type Geo = { wards: string[]; counties: string[]; countries: string[]; default_country: string }

const flag = (v: unknown) => (v === true || v === 'true' || v === 1 ? true : undefined)

export const Route = createFileRoute('/checkout/shelve')({
  validateSearch: (s: Record<string, unknown>): Search => ({ funds: flag(s.funds), account: flag(s.account), sms: flag(s.sms) }),
  component: ShelvePage,
})

const OPTION_ICON: Record<string, LucideIcon> = { pickup: Store, shelf_run: Truck, rider: Bike, taxi: Car }

function ShelvePage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { user, ready } = useAuth()
  const { cart } = useCart()
  const toast = useToast()

  const [opts, setOpts] = useState<Options | null>(null)
  const [geo, setGeo] = useState<Geo>({ wards: [], counties: [], countries: [], default_country: 'Kenya' })
  const [country, setCountry] = useState('')
  const [county, setCounty] = useState('')
  const [ward, setWard] = useState('')
  const [pin, setPin] = useState<Pin | null>(null)
  const [locating, setLocating] = useState(false)
  // The shelf the buyer collects from when the order ends at one. Null means "whichever is nearest",
  // which is what the API offers until he picks a different one.
  const [collectId, setCollectId] = useState<number | null>(null)
  const [collectList, setCollectList] = useState<CollectShelf[] | null>(null)
  const [option, setOption] = useState('rider')
  const [form, setForm] = useState({ recipient_name: '', phone: '', estate: '', house: '', notes: '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: '/checkout/shelve' } })
  }, [ready, user, navigate])

  // Restore anything the buyer already filled in + the confirmations from /cart.
  useEffect(() => {
    const s = readCheckout()
    writeCheckout({ funds: search.funds ?? s.funds, account: search.account ?? s.account, sms: search.sms ?? s.sms })
    if (s.delivery_option) setOption(s.delivery_option)
    if (s.collect_shelve_id) setCollectId(s.collect_shelve_id)
    if (s.ward) setWard(s.ward)
    if (s.county) setCounty(s.county)
    if (s.country) setCountry(s.country)
    if (typeof s.dest_lat === 'number' && typeof s.dest_lng === 'number') setPin({ lat: s.dest_lat, lng: s.dest_lng })
    setForm((f) => ({ ...f, recipient_name: s.recipient_name || f.recipient_name, phone: s.phone || f.phone, estate: s.estate || '', house: s.house || '', notes: s.notes || '' }))
  }, [search.funds, search.account, search.sms])
  useEffect(() => {
    if (user) setForm((f) => ({ ...f, recipient_name: f.recipient_name || user.name, phone: f.phone || user.telephone }))
  }, [user])

  const loadOptions = useCallback(async (w?: string, at?: Pin | null, dest?: number | null) => {
    try {
      const o = await api.get<Options>('/cart/checkout-options', {
        ward: w || undefined, lat: at?.lat, lng: at?.lng, dest_shelve_id: dest ?? undefined,
      })
      setOpts(o)
    } catch (e: any) {
      setLoadErr(e.message)
    }
  }, [])
  useEffect(() => {
    if (!user) return
    loadOptions(undefined, null, collectId)
    api.get<Geo>('/wards').then((g) => { setGeo(g); setCountry((c) => c || g.default_country) }).catch(() => {})
    // Only on sign-in: every later reprice goes through pickWard / dropPin / pickCollect, which each
    // know what changed. Re-running here on `collectId` would fire a second request behind those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadOptions])

  const pickWard = (w: string) => {
    setWard(w)
    loadOptions(w, pin, collectId)
  }

  /** Choosing a different shelf to collect from reprices both options that end at one. */
  const pickCollect = (id: number) => {
    setCollectId(id)
    loadOptions(ward, pin, id)
  }

  /** The shelves the buyer could collect from, nearest first — loaded only when he asks to change it. */
  const openCollectList = async () => {
    if (collectList) return setCollectList(null)
    try {
      const r = await api.get<{ shelves: CollectShelf[] }>('/cart/collect-shelves', {
        ward: ward || undefined, county: county || undefined, lat: pin?.lat, lng: pin?.lng,
      })
      setCollectList(r.shelves)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  /** Every way the pin can move — GPS, a tap on the map, a drag — ends here, and re-prices the trip. */
  const dropPin = useCallback((lat: number, lng: number) => {
    const next = { lat, lng }
    setPin(next)
    writeCheckout({ dest_lat: lat, dest_lng: lng })
    loadOptions(ward, next, collectId)
  }, [loadOptions, ward, collectId])

  const useGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('GPS is not available on this device — tap your spot on the map instead')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        dropPin(Number(pos.coords.latitude.toFixed(6)), Number(pos.coords.longitude.toFixed(6)))
        toast.success('Location set — the delivery is priced from here')
      },
      (e) => {
        setLocating(false)
        toast.error(e.code === e.PERMISSION_DENIED
          ? 'Location is blocked for this site — tap your spot on the map instead'
          : 'Could not read your location — tap your spot on the map instead')
      },
      { timeout: 8000, enableHighAccuracy: true },
    )
  }

  if (!ready || !user) return <><CheckoutStepper step={2} /><PageLoading /></>
  if (loadErr) return <><CheckoutStepper step={2} /><div className="container-x py-10"><EmptyState icon={<ShoppingCart size={30} />} title="Could not load checkout" sub={loadErr} action={<LinkButton to="/cart" variant="outline">Back to cart</LinkButton>} /></div></>
  if (!opts) return <><CheckoutStepper step={2} /><PageLoading /></>

  const lines = cart.items.filter((l) => !l.saved_for_later)
  if (opts.shelves.length === 0 || lines.length === 0) {
    return (
      <>
        <CheckoutStepper step={2} />
        <div className="container-x py-10">
          <EmptyState icon={<ShoppingCart size={30} />} title="Your cart is empty" sub="Add verified items from a shelf to continue to checkout." action={<LinkButton to={'/items' as any}>Browse items</LinkButton>} />
        </div>
      </>
    )
  }

  // The API returns the shelves nearest-first, and the first is the one an order is filed against.
  // The buyer does not choose it — a run collects from all of them anyway.
  const shelf = opts.shelves[0]
  // The API prices every option from the pin and the primary shelf — the browser never computes a fee.
  const feeFor = (key: string) => opts.delivery_options.find((o) => o.key === key)?.fee ?? 0
  const picked = opts.delivery_options.find((o) => o.key === option)
  const chosen = picked && picked.available ? picked : opts.delivery_options.find((o) => o.available) ?? opts.delivery_options[0]
  const fee = feeFor(chosen.key)
  // A run to a door needs an address; a run to a shelf needs a shelf. Collecting at each shelf yourself
  // needs neither — you already know where your own items are.
  const needsAddress = DOOR_OPTIONS.includes(chosen.key)
  // A shelf_run ends at a shelf, so it needs one. So does ANY cart carrying an out-of-county item,
  // whatever the buyer picked: that shelf is the address the inter-city leg is sent to, and without
  // one there is nowhere in his county for the item to arrive.
  const needsShelf = SHELF_OPTIONS.includes(chosen.key) || Boolean(opts.courier?.required)
  const collectAt = opts.collect_at
  const s = cart.summary
  const total = s.total + fee

  // Every shelf holding an item reads the same — none of them is a choice. The one pin that stands out
  // is the shelf the buyer collects from, when the option he picked ends at one.
  const points: MapPoint[] = opts.shelves.map((sh) => ({
    id: `shelf-${sh.id}`, lat: sh.lat, lng: sh.lng, label: sh.name, tone: 'success' as const,
  }))
  if (needsShelf && collectAt && collectAt.lat != null && collectAt.lng != null && !opts.shelves.some((sh) => sh.id === collectAt.id)) {
    points.push({ id: `collect-${collectAt.id}`, lat: collectAt.lat, lng: collectAt.lng, label: `Collect at ${collectAt.name}`, tone: 'primary' })
  }
  if (pin) points.push({ id: 'me', lat: pin.lat, lng: pin.lng, label: 'Deliver here', tone: 'secondary', draggable: true })

  const toPayment = () => {
    const e: Record<string, string> = {}
    if (needsAddress) {
      if (!form.recipient_name.trim()) e.recipient_name = 'Required'
      if (!form.phone.trim()) e.phone = 'Required'
      if (!form.estate.trim()) e.estate = 'Required'
      // A rider arriving at an estate gate with no gate and no house number is a failed delivery, and
      // the buyer is the only person who can prevent it.
      if (!form.house.trim() && !form.notes.trim()) e.notes = 'Tell the rider which gate and house number'
    }
    setErr(e)
    if (Object.keys(e).length) {
      toast.error('Fill in the delivery details first')
      return
    }
    if (needsShelf && !collectAt) {
      toast.error('Pick the shelf you want your items brought to')
      return
    }
    writeCheckout({
      shelve_id: shelf.id,
      shelve_name: shelf.name,
      shelve_ward: shelf.ward,
      collect_shelve_id: needsShelf && collectAt ? collectAt.id : null,
      collect_shelve_name: needsShelf && collectAt ? collectAt.name : '',
      collect_shelve_ward: needsShelf && collectAt ? collectAt.ward : '',
      delivery_option: chosen.key,
      delivery_title: chosen.title,
      delivery_fee: fee,
      recipient_name: form.recipient_name,
      phone: form.phone,
      estate: form.estate,
      house: form.house,
      notes: form.notes,
      ward: ward || shelf.ward,
      county: county || shelf.county,
      country: country || shelf.country,
      dest_lat: pin?.lat ?? null,
      dest_lng: pin?.lng ?? null,
    })
    navigate({ to: '/checkout/payment', search: {} })
  }

  const field = (k: keyof typeof form) => ({ value: form[k], onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: ev.target.value }), error: err[k] })

  return (
    <>
      <CheckoutStepper step={2} />
      <div className="container-x py-4 md:py-8">
        <div className="grid gap-5 md:grid-cols-[1fr_380px] md:gap-7">
          <section className="flex min-w-0 flex-col gap-4 md:gap-[18px]">
            <div className="hidden flex-col gap-1 md:flex">
              <h1 className="text-[26px] leading-tight">Choose your shelf &amp; delivery</h1>
              <p className="m-0 text-[13px] text-ink-2">Each item waits on its own shelf. Collect them yourself for free, or have one rider gather the lot in a single run — to a shelf near you, or to your door.</p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3.5 md:gap-3.5 md:rounded-lg md:p-[18px]">
              <h3 className="text-[15px]">Where are you?</h3>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
                <Select label="Country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Select country" className="hidden md:flex">
                  {geo.countries.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Select label="County" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Select county">
                  {geo.counties.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Select label="Ward" value={ward} onChange={(e) => pickWard(e.target.value)} placeholder="Select ward">
                  {geo.wards.map((w) => <option key={w} value={w}>{w}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
                <Button variant="outline" size="sm" loading={locating} icon={<LocateFixed size={14} />} onClick={useGps} className="w-full md:w-auto">
                  {pin ? 'Update my location' : 'Use GPS'}
                </Button>
                <span className="text-[11px] text-muted">UKO keeps {opts.shelves_per_ward} verified shelves per ward — {opts.wards_live} wards live</span>
              </div>
              <MapView
                points={points}
                pick
                onPick={dropPin}
                height={220}
                hint={pin ? `Pinned at ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}` : undefined}
              />
              {/* A rider is priced by how far he rides, so the pin is the price. Say so before the fee changes under him. */}
              {pin ? (
                <span className="text-[11px] text-muted">
                  Your delivery is priced from this pin to the shelf. Drag it if it is not quite right.
                </span>
              ) : (
                <span className="text-[11px] text-secondary-600">
                  Tap the map or use GPS to place your pin — until then a rider is quoted at the shelf's flat rate.
                </span>
              )}
            </div>

            {/* Not a choice any more. Every one of these shelves is collected from — the buyer picks how
                the cart reaches him below, not which shelf it leaves from. This is here so he can see
                where his items actually are, and the hours, in case he goes and gets them himself. */}
            <div className="flex flex-col gap-2.5 md:gap-3">
              <h3 className="text-[15px]">
                {opts.shelves.length === 1 ? 'Your item is held here' : `Your items are held at ${opts.shelves.length} shelves`}
              </h3>
              {opts.shelves.map((sh) => (
                <div key={sh.id} className="flex w-full gap-3 rounded-md border border-border bg-bg p-3 md:gap-3.5 md:rounded-lg md:p-4">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2"><Store size={14} /></span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-head text-xs font-bold text-ink md:text-sm">{sh.name}</span>
                      <Chip size="sm" className="!bg-surface">{sh.cart_items} item{sh.cart_items === 1 ? '' : 's'}</Chip>
                    </div>
                    <span className="text-[10px] text-ink-2 md:text-xs">{sh.ward} ward{sh.distance_km != null ? ` · ${sh.distance_km} km away` : ''}{sh.address ? ` · ${sh.address}` : ''}</span>
                    <span className="hidden items-center gap-1 text-[11px] text-muted md:flex"><Clock size={12} /> Mon–Sat {sh.opening_time} – {sh.closing_time} · {sh.open_sunday ? `Sun ${sh.sunday_hours || 'open'}` : 'closed Sun'}</span>
                    <span className="text-[10px] text-muted md:hidden">Mon–Sat {sh.opening_time} – {sh.closing_time} · storage free</span>
                  </div>
                  <div className="hidden w-[130px] shrink-0 flex-col items-end gap-1 text-right md:flex">
                    <span className="text-[11px] text-muted">Storage <b className="text-xs font-bold text-ink">Free</b></span>
                    <span className="text-[11px] text-muted">On its own <b className="text-xs font-bold text-ink">{ksh(sh.delivery_fee)}</b></span>
                  </div>
                </div>
              ))}
            </div>

            {/* An item on a shelf in another county cannot reach the buyer by ANY of the options below
                until a van has brought it to his county, so it is not one of them — it is priced
                automatically and shown here, before he picks how the rest of the cart moves. */}
            {opts.courier?.required && (
              <div className={cx('flex flex-col gap-2 rounded-lg border p-3.5', opts.courier.available ? 'border-secondary/40 bg-secondary-050' : 'border-danger/40 bg-danger-050')}>
                <div className="flex items-start gap-2.5">
                  <Package size={17} className={opts.courier.available ? 'mt-0.5 shrink-0 text-secondary-600' : 'mt-0.5 shrink-0 text-danger'} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-bold text-ink">
                      {opts.courier.available
                        ? `Coming from ${opts.courier.counties.join(', ')}`
                        : 'These items cannot be sent yet'}
                    </span>
                    <span className="text-[11px] leading-[1.45] text-ink-2">{opts.courier.sub}</span>
                  </div>
                  {opts.courier.available && (
                    <span className="font-head text-[15px] font-extrabold text-secondary-600">{ksh(opts.courier.fee)}</span>
                  )}
                </div>
                {opts.courier.available && (
                  <ul className="m-0 flex list-none flex-col gap-1 border-t border-secondary/20 p-0 pt-2">
                    {opts.courier.legs.map((leg) => (
                      <li key={leg.from_shelve_id} className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-2">
                        <span className="font-semibold text-ink">{leg.from_shelve_name}</span>
                        <span>→ {leg.to_shelve_name}</span>
                        <span>· {leg.weight_kg} kg · {leg.class_name.toLowerCase()}</span>
                        {leg.days ? <span>· {leg.days}</span> : null}
                        <span className="ml-auto font-semibold text-ink">{ksh(leg.fee)}</span>
                      </li>
                    ))}
                    <li className="mt-0.5 text-[11px] text-muted">
                      Included in every price below. You collect them at {opts.collect_at?.name ?? 'your shelf'} — or add a run to your door.
                    </li>
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2.5 md:gap-3">
              <h3 className="text-[15px]"><span className="md:hidden">How do you want it?</span><span className="hidden md:inline">How do you want to receive the items?</span></h3>
              <div className="grid gap-2.5 md:grid-cols-3 md:gap-3">
                {opts.delivery_options.map((o) => {
                  const Icon = OPTION_ICON[o.key] || Package
                  const active = o.key === chosen.key
                  const f = feeFor(o.key)
                  const saving = o.available ? o.detail?.saving ?? 0 : 0
                  return (
                    <button type="button" key={o.key} disabled={!o.available} onClick={() => setOption(o.key)} className={cx('flex items-center gap-3 rounded-md border p-3 text-left transition-colors md:flex-col md:items-stretch md:gap-2 md:rounded-lg md:p-3.5', !o.available ? 'cursor-not-allowed border-border bg-surface-2 opacity-60' : active ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}>
                      <div className="flex items-center justify-between md:w-full">
                        <Icon size={18} className={active ? 'text-primary' : 'text-ink-2'} />
                        {saving > 0 && <Chip size="sm" tone="success">Saves {ksh(saving)}</Chip>}
                        <Radio checked={active} className="hidden md:flex" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-1">
                        <span className="text-xs font-bold text-ink md:text-[13px]">{o.title}</span>
                        {/* When an option is withdrawn, `sub` is the reason — say it instead of showing a dash and nothing else. */}
                        <span className="text-[10px] text-ink-2 md:text-[11px] md:leading-[1.45]">{o.sub}</span>
                      </div>
                      <span className={cx('font-head text-[13px] font-extrabold md:text-[15px]', !o.available ? 'text-muted' : active ? 'text-primary-600' : 'text-ink')}>{!o.available ? '—' : f ? ksh(f) : 'Free'}</span>
                    </button>
                  )
                })}
              </div>
              {/* One run over several shelves is a price the buyer cannot check himself — show the working. */}
              {chosen.detail?.stops && chosen.detail.stops.length > 1 && chosen.available && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface px-3 py-2.5 text-[11px] text-ink-2">
                  <span><b className="text-ink">{chosen.detail.vehicle_name}</b> collects from {chosen.detail.stops.length} shelves in one run</span>
                  {chosen.detail.per_shelf ? <span>· {ksh(chosen.detail.per_shelf)} a shelf</span> : null}
                  {chosen.detail.separate_fee ? <span>· separate trips would be {ksh(chosen.detail.separate_fee)}</span> : null}
                  {opts.weight_kg ? <span>· {opts.weight_kg} kg</span> : null}
                </div>
              )}
            </div>

            {needsShelf && (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3.5 md:gap-3.5 md:rounded-lg md:p-[18px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm md:text-[15px]">Collect from</h3>
                  <Button variant="ghost" size="sm" onClick={openCollectList}>{collectList ? 'Close' : 'Choose another shelf'}</Button>
                </div>
                {collectAt ? (
                  <div className="flex flex-col gap-1">
                    <span className="font-head text-sm font-bold text-ink">{collectAt.name}</span>
                    <span className="text-[11px] text-ink-2">{collectAt.ward} ward{collectAt.distance_km != null ? ` · ${collectAt.distance_km} km from you` : ''}{collectAt.address ? ` · ${collectAt.address}` : ''}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted"><Clock size={12} /> Mon–Sat {collectAt.opening_time} – {collectAt.closing_time}</span>
                    <span className="mt-1 text-[11px] text-secondary-600">Collection is free — bring your ID and the shelve code we send you when the order is paid.</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-secondary-600">No live shelf near you yet. Pick a ward above, or have the run come to your door instead.</span>
                )}
                {collectList && (
                  <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
                    {collectList.map((cs) => (
                      <button type="button" key={cs.id} onClick={() => { pickCollect(cs.id); setCollectList(null) }} className={cx('flex items-start gap-3 rounded-md border p-2.5 text-left transition-colors', cs.id === collectAt?.id ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}>
                        <Radio checked={cs.id === collectAt?.id} className="mt-0.5" />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs font-bold text-ink">{cs.name}</span>
                          <span className="text-[10px] text-ink-2">{cs.ward} ward{cs.distance_km != null ? ` · ${cs.distance_km} km` : ''}</span>
                        </div>
                      </button>
                    ))}
                    {collectList.length === 0 && <span className="text-[11px] text-muted">No live shelves found there.</span>}
                  </div>
                )}
              </div>
            )}

            {needsAddress && (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3.5 md:gap-3.5 md:rounded-lg md:p-[18px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm md:text-[15px]">Delivery details</h3>
                  <Chip size="sm" tone="danger">Required</Chip>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input label="Recipient name" required placeholder="Who receives the parcel" {...field('recipient_name')} />
                  <Input label="Phone number" required type="tel" placeholder="07xx xxx xxx" {...field('phone')} />
                  <Input label="Estate / building" required placeholder="e.g. Riverside Court, Block B" {...field('estate')} />
                  <Input label="House / office no." placeholder="e.g. B12" {...field('house')} />
                </div>
                <Textarea label="Gate & directions" placeholder="e.g. Gate 3 off the service lane, ask for the security desk, house B12, call on arrival" rows={3} {...field('notes')} />
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-3.5 rounded-lg border border-border bg-bg p-4 md:p-5">
            <h3 className="text-[17px]">Order summary</h3>
            <div className="flex flex-col gap-2.5">
              {lines.map((l) => <MiniItem key={l.id} image={l.item.image} title={l.item.title} sub={`×${l.quantity}`} price={l.amount * l.quantity} />)}
            </div>
            <Divider />
            <div className="flex flex-col gap-2.5">
              <KeyValue label="Item subtotal" value={ksh(s.subtotal)} />
              <KeyValue
                label={`${chosen.title} · ${needsShelf && collectAt ? collectAt.name : chosen.distance_km != null ? `${chosen.distance_km} km` : shelf.ward}`}
                value={fee ? ksh(fee) : 'Free'}
              />
              {s.protect_fee > 0 && <KeyValue label={<span title="1% of each item's price (KSh 20 minimum, KSh 500 maximum a unit). Refunds you if the item is lost, stolen or damaged while UKO holds it.">UKO Protect</span>} value={ksh(s.protect_fee)} />}
              {s.discount > 0 && <KeyValue label={`Promo · ${s.promo_code}`} value={<span className="text-success">− {ksh(s.discount)}</span>} />}
            </div>
            <Divider />
            <div className="flex items-center justify-between">
              <span className="font-head text-[15px] font-bold">Total due</span>
              <span className="font-head text-[22px] font-extrabold tracking-tight">{ksh(total)}</span>
            </div>
            <Button full size="lg" onClick={toPayment} className="hidden md:inline-flex">To payment</Button>
            <LinkButton to="/cart" variant="outline" full className="hidden md:inline-flex">Back</LinkButton>
          </aside>
        </div>
      </div>
      <StickyCta label="Total incl. delivery" value={ksh(total)}>
        <Button full onClick={toPayment}>To payment</Button>
      </StickyCta>
    </>
  )
}
