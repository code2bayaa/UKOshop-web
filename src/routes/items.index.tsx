/** 02 · Category / More Items (+ M2 mobile filters sheet) — /items */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, Grid3x3, ImageIcon, List, Loader2, PackageSearch, SlidersHorizontal, X } from 'lucide-react'
import { api, publicGet, type ItemCard } from '#/lib/api'
import { ksh, priceRange } from '#/lib/format'
import { ProductCard } from '#/components/cards'
import { Breadcrumbs, Button, Checkbox, Chip, EmptyState, Select, Skeleton, Stars, Toggle, VerifiedBadge, cx } from '#/components/ui'

// ------------------------------------------------------------------ search params
export type ItemsSearch = {
  q?: string
  category?: string
  sub?: string
  catalogue?: string
  ward?: string | string[]
  min_amount?: number
  max_amount?: number
  size?: string | string[]
  color?: string | string[]
  gender?: string | string[]
  condition?: string | string[]
  verified?: boolean
  sort?: string
  page?: number
  seller?: number
  shelve?: number
}

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : undefined)
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}
const multi = (v: unknown): string | string[] | undefined => {
  if (Array.isArray(v)) {
    const a = v.map(String).filter(Boolean)
    return a.length ? a : undefined
  }
  return str(v)
}
const bool = (v: unknown) => (v === true || v === 'true' || v === 1 || v === '1' ? true : undefined)
const arr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

type ItemsResponse = {
  items: ItemCard[]
  total: number
  page: number
  per_page: number
  pages: number
  title: string
  crumbs: { name: string; href: string }[]
  shelves_count: number
  filters: { wards: { name: string; count: number }[]; sizes: string[]; colors: string[]; genders: string[]; conditions: string[] }
}

export const Route = createFileRoute('/items/')({
  validateSearch: (raw: Record<string, unknown>): ItemsSearch => ({
    q: str(raw.q),
    category: str(raw.category),
    sub: str(raw.sub),
    catalogue: str(raw.catalogue),
    ward: multi(raw.ward),
    min_amount: num(raw.min_amount),
    max_amount: num(raw.max_amount),
    size: multi(raw.size),
    color: multi(raw.color),
    gender: multi(raw.gender),
    condition: multi(raw.condition),
    verified: bool(raw.verified),
    sort: str(raw.sort),
    page: num(raw.page),
    seller: num(raw.seller),
    shelve: num(raw.shelve),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => publicGet<ItemsResponse>('/items', deps),
  component: ItemsPage,
})

// ------------------------------------------------------------------ filter draft
type Draft = { verified: boolean; min: string; max: string; size: string[]; ward: string[]; gender: string[]; condition: string[]; color: string[] }
const draftFrom = (s: ItemsSearch): Draft => ({
  verified: !!s.verified,
  min: s.min_amount !== undefined ? String(s.min_amount) : '',
  max: s.max_amount !== undefined ? String(s.max_amount) : '',
  size: arr(s.size),
  ward: arr(s.ward),
  gender: arr(s.gender),
  condition: arr(s.condition),
  color: arr(s.color),
})
const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const CLEARED: Partial<ItemsSearch> = { verified: undefined, min_amount: undefined, max_amount: undefined, size: undefined, ward: undefined, gender: undefined, condition: undefined, color: undefined, page: undefined }

const SORTS: [string, string][] = [['relevant', 'Sort: Most relevant'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['newest', 'Newest'], ['rating', 'Top rated']]
const SWATCH: Record<string, string> = { black: '#131629', white: '#ffffff', grey: '#9aa0b4', gray: '#9aa0b4', silver: '#c0c4cf', red: '#d23b3b', blue: '#2f44a8', navy: '#1b2a6b', green: '#17916a', brown: '#7b4b2a', tan: '#c9a27a', beige: '#e6d5b8', yellow: '#f2c02e', orange: '#ff7a45', pink: '#e879a6', purple: '#7c3aed', gold: '#d4a017', cream: '#f5efe0', maroon: '#7f1d1d' }
const swatch = (c: string) => SWATCH[c.toLowerCase()] || c.toLowerCase()
const condLabel = (c: string) => (c.toLowerCase() === 'new' ? 'Brand new' : c)

// ------------------------------------------------------------------ page
function ItemsPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/items/' })

  const searchKey = useMemo(() => JSON.stringify({ ...search, page: undefined }), [search])
  const basePage = data.page

  // pages loaded on scroll (in addition to the loader page)
  const [store, setStore] = useState<{ key: string; pages: Record<number, ItemCard[]> }>({ key: '', pages: {} })
  const pages: Record<number, ItemCard[]> = useMemo(() => (store.key === searchKey ? { ...store.pages, [basePage]: data.items } : { [basePage]: data.items }), [store, searchKey, basePage, data.items])
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const [loading, setLoading] = useState<number | null>(null)
  const inflight = useRef(new Set<number>())
  const [activePage, setActivePage] = useState(basePage)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sheet, setSheet] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(search))
  useEffect(() => setDraft(draftFrom(search)), [searchKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPage = useCallback(async (n: number) => {
    if (n < 1 || n > data.pages || pagesRef.current[n] || inflight.current.has(n)) return
    inflight.current.add(n)
    setLoading(n)
    try {
      const r = await api.get<ItemsResponse>('/items', { ...search, page: n })
      setStore((s) => ({ key: searchKey, pages: s.key === searchKey ? { ...s.pages, [n]: r.items } : { [n]: r.items } }))
    } catch {
      /* ignore — the sentinel retries when it re-enters the viewport */
    } finally {
      inflight.current.delete(n)
      setLoading((l) => (l === n ? null : l))
    }
  }, [search, searchKey, data.pages])

  const pageNumbers = useMemo(() => Object.keys(pages).map(Number).sort((a, b) => a - b), [pages])
  const nextPage = pageNumbers[pageNumbers.length - 1] + 1
  const hasMore = nextPage <= data.pages

  // infinite scroll sentinel
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadPage(nextPage) }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, nextPage, loadPage])

  // which page marker is at the top of the viewport (for the page rail)
  useEffect(() => {
    const onScroll = () => {
      let cur = pageNumbers[0] ?? basePage
      document.querySelectorAll<HTMLElement>('[data-page-marker]').forEach((m) => { if (m.getBoundingClientRect().top <= 180) cur = Number(m.dataset.pageMarker) })
      setActivePage(cur)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pageNumbers, basePage])

  const goToPage = async (n: number) => {
    const need: number[] = []
    for (let p = Math.min(n, basePage); p <= Math.max(n, basePage); p++) if (!pagesRef.current[p]) need.push(p)
    await Promise.all(need.map(loadPage))
    requestAnimationFrame(() => document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const apply = (d: Draft) => {
    setSheet(false)
    navigate({
      search: (s) => ({
        ...s,
        page: undefined,
        verified: d.verified || undefined,
        min_amount: d.min !== '' ? Number(d.min) : undefined,
        max_amount: d.max !== '' ? Number(d.max) : undefined,
        size: d.size.length ? d.size : undefined,
        ward: d.ward.length ? d.ward : undefined,
        gender: d.gender.length ? d.gender : undefined,
        condition: d.condition.length ? d.condition : undefined,
        color: d.color.length ? d.color : undefined,
      }),
    })
  }
  const clearAll = () => { setSheet(false); navigate({ search: (s) => ({ ...s, ...CLEARED }) }) }
  const patch = (p: Partial<ItemsSearch>) => navigate({ search: (s) => ({ ...s, ...p, page: undefined }) })

  // active filter chips
  const active: { label: string; remove: () => void }[] = []
  if (search.q) active.push({ label: `"${search.q}"`, remove: () => patch({ q: undefined }) })
  if (search.verified) active.push({ label: 'Verified', remove: () => patch({ verified: undefined }) })
  if (search.min_amount !== undefined || search.max_amount !== undefined) active.push({ label: `${search.min_amount !== undefined ? ksh(search.min_amount) : 'Any'} – ${search.max_amount !== undefined ? ksh(search.max_amount) : 'any'}`, remove: () => patch({ min_amount: undefined, max_amount: undefined }) })
  arr(search.ward).forEach((w) => active.push({ label: w, remove: () => patch({ ward: arr(search.ward).filter((x) => x !== w) }) }))
  arr(search.size).forEach((v) => active.push({ label: `Size ${v}`, remove: () => patch({ size: arr(search.size).filter((x) => x !== v) }) }))
  arr(search.gender).forEach((v) => active.push({ label: v, remove: () => patch({ gender: arr(search.gender).filter((x) => x !== v) }) }))
  arr(search.condition).forEach((v) => active.push({ label: condLabel(v), remove: () => patch({ condition: arr(search.condition).filter((x) => x !== v) }) }))
  arr(search.color).forEach((v) => active.push({ label: v, remove: () => patch({ color: arr(search.color).filter((x) => x !== v) }) }))
  if (search.seller) active.push({ label: 'This seller', remove: () => patch({ seller: undefined }) })
  if (search.shelve) active.push({ label: 'This shelf', remove: () => patch({ shelve: undefined }) })

  const sort = search.sort || 'relevant'
  const perPage = data.per_page || 8

  return (
    <div className="flex flex-col pb-6">
      {/* Breadcrumb strip */}
      <div className="w-full border-b border-border bg-surface">
        <div className="container-x flex h-[46px] items-center"><Breadcrumbs crumbs={data.crumbs} /></div>
      </div>

      <div className="container-x flex gap-7 pt-5 md:pt-7">
        {/* Filter rail */}
        <aside className="hidden w-[260px] shrink-0 self-start lg:block">
          <div className="overflow-hidden rounded-lg border border-border bg-bg">
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3.5">
              <span className="font-head text-sm font-bold">Filters</span>
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-secondary-600 hover:underline">Clear all</button>
            </div>
            <FilterForm filters={data.filters} draft={draft} onChange={setDraft} />
            <div className="p-4"><Button full onClick={() => apply(draft)}>Apply filters</Button></div>
          </div>
        </aside>

        {/* Results */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-[22px] leading-tight md:text-[26px]">{data.title}</h1>
              <p className="m-0 text-[13px] text-ink-2">{data.total.toLocaleString()} items · {data.shelves_count} shelves · updated just now</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" icon={<SlidersHorizontal size={15} />} className="lg:hidden" onClick={() => setSheet(true)}>Filters</Button>
              <Select value={sort} onChange={(e) => patch({ sort: e.target.value === 'relevant' ? undefined : e.target.value })} className="w-[150px] md:w-[190px]" aria-label="Sort">
                {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              <div className="hidden overflow-hidden rounded-md border border-border-strong md:flex">
                <button type="button" aria-label="Grid view" onClick={() => setView('grid')} className={cx('flex h-[42px] w-10 items-center justify-center', view === 'grid' ? 'bg-primary-050 text-primary' : 'text-ink-2 hover:bg-surface')}><Grid3x3 size={16} /></button>
                <button type="button" aria-label="List view" onClick={() => setView('list')} className={cx('flex h-[42px] w-10 items-center justify-center border-l border-border-strong', view === 'list' ? 'bg-primary-050 text-primary' : 'text-ink-2 hover:bg-surface')}><List size={16} /></button>
              </div>
            </div>
          </div>

          {active.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-2">Active:</span>
              {active.map((a, i) => <Chip key={i} active onRemove={a.remove}>{a.label}</Chip>)}
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-secondary-600 hover:underline">Clear all</button>
            </div>
          )}

          {data.total === 0 ? (
            <EmptyState icon={<PackageSearch size={28} />} title="No items match these filters" sub="Try widening the amount range, removing a ward, or clearing all filters." action={<Button variant="outline" size="sm" onClick={clearAll}>Clear all filters</Button>} />
          ) : (
            pageNumbers.map((n) => {
              const rows = pages[n]
              const from = (n - 1) * perPage + 1
              const to = Math.min(data.total, from + rows.length - 1)
              return (
                <section key={n} id={`page-${n}`} data-page-marker={n} className="flex scroll-mt-24 flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] text-muted">results {from}–{to}{n === basePage ? ` of ${data.total.toLocaleString()}` : ' · loaded on scroll'}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  {view === 'grid' ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
                      {rows.map((i) => <ProductCard key={i.id} item={i} />)}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">{rows.map((i) => <ListRow key={i.id} item={i} />)}</div>
                  )}
                </section>
              )
            })
          )}

          {hasMore && (
            <div ref={sentinel} className="flex flex-col gap-3">
              {loading !== null && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((k) => <Skeleton key={k} className={cx('h-[290px] rounded-lg', k === 3 && 'md:hidden xl:block')} />)}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 py-2 text-[13px] text-ink-2">
                {loading !== null ? <><Loader2 size={16} className="spin text-primary" /> Loading page {loading} of {data.pages}…</> : <button type="button" onClick={() => loadPage(nextPage)} className="font-semibold text-primary hover:underline">Load page {nextPage} of {data.pages}</button>}
              </div>
            </div>
          )}
          {!hasMore && data.total > 0 && <p className="m-0 py-2 text-center text-[12px] text-muted">You have seen all {data.total.toLocaleString()} items</p>}
        </div>
      </div>

      {/* Page rail (desktop) */}
      {data.pages > 1 && (
        <div className="fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-border bg-bg p-1.5 shadow-card xl:flex">
          <button type="button" aria-label="Scroll up" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface"><ChevronUp size={15} /></button>
          {railPages(data.pages).map((p, i) => p === '…' ? (
            <span key={`e${i}`} className="text-muted">⋯</span>
          ) : (
            <button key={p} type="button" onClick={() => goToPage(p)} className={cx('flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-xs font-semibold transition-colors', activePage === p ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface')}>{p}</button>
          ))}
          <button type="button" aria-label="Scroll down" onClick={() => goToPage(Math.min(data.pages, activePage + 1))} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface"><ChevronDown size={15} /></button>
        </div>
      )}

      {/* Mobile filter sheet (M2 · Filter Sheet state) */}
      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end bg-ink/50 lg:hidden" onClick={() => setSheet(false)}>
          <div onClick={(e) => e.stopPropagation()} className="fade-up flex max-h-[88vh] w-full flex-col rounded-t-[20px] bg-bg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <span className="font-head text-base font-bold">Filters</span>
              <div className="flex items-center gap-4">
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-secondary-600">Clear all</button>
                <button type="button" aria-label="Close" onClick={() => setSheet(false)} className="text-ink-2"><X size={18} /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><FilterForm filters={data.filters} draft={draft} onChange={setDraft} /></div>
            <div className="flex gap-2.5 border-t border-border p-4 pb-[calc(16px+66px)]">
              <Button variant="outline" full onClick={() => { setDraft(draftFrom(search)); setSheet(false) }}>Cancel</Button>
              <Button full onClick={() => apply(draft)}>Apply</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function railPages(total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  return [1, 2, 3, 4, 5, '…', total]
}

// ------------------------------------------------------------------ filter form (shared by rail + sheet)
function FilterForm({ filters, draft, onChange }: { filters: ItemsResponse['filters']; draft: Draft; onChange: (d: Draft) => void }) {
  const set = (p: Partial<Draft>) => onChange({ ...draft, ...p })
  const numInput = 'w-full min-w-0 rounded-md border border-border bg-bg px-3 py-2.5 text-[13px] outline-none placeholder:text-muted focus:border-primary-300'
  return (
    <div className="flex flex-col divide-y divide-border">
      <FilterSection label="Verified only">
        <Toggle checked={draft.verified} onChange={(v) => set({ verified: v })} label={<span className="flex-1">Shelf-verified items</span>} className="w-full justify-between" />
      </FilterSection>
      <FilterSection label="Amount (KSh)">
        <div className="flex gap-2">
          <input inputMode="numeric" placeholder="Min 500" value={draft.min} onChange={(e) => set({ min: e.target.value.replace(/[^\d]/g, '') })} className={numInput} />
          <input inputMode="numeric" placeholder="Max 25,000" value={draft.max} onChange={(e) => set({ max: e.target.value.replace(/[^\d]/g, '') })} className={numInput} />
        </div>
        <div className="relative mx-1 mt-1 h-1.5 rounded-full bg-surface-2">
          <div className="absolute left-[8%] right-[20%] h-full rounded-full bg-primary" />
          <span className="absolute left-[8%] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-bg" />
          <span className="absolute right-[20%] top-1/2 h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-bg" />
        </div>
        <span className="text-[11px] text-muted">{draft.min || draft.max ? `${draft.min ? ksh(Number(draft.min)) : 'Any'} – ${draft.max ? ksh(Number(draft.max)) : 'any'}` : 'Leave blank for any amount'}</span>
      </FilterSection>
      {filters.sizes.length > 0 && (
        <FilterSection label="Size">
          <div className="flex flex-wrap gap-1.5">{filters.sizes.map((s) => <Chip key={s} size="sm" active={draft.size.includes(s)} onClick={() => set({ size: toggleIn(draft.size, s) })}>{s}</Chip>)}</div>
        </FilterSection>
      )}
      {filters.wards.length > 0 && (
        <FilterSection label="Location (ward)">
          <div className="flex flex-col gap-2.5">
            {filters.wards.map((w) => <Checkbox key={w.name} checked={draft.ward.includes(w.name)} onChange={() => set({ ward: toggleIn(draft.ward, w.name) })} label={<>{w.name} <span className="text-muted">({w.count})</span></>} />)}
          </div>
        </FilterSection>
      )}
      <FilterSection label="Gender">
        <div className="flex flex-wrap gap-1.5">{filters.genders.map((g) => <Chip key={g} size="sm" active={draft.gender.includes(g)} onClick={() => set({ gender: toggleIn(draft.gender, g) })}>{g}</Chip>)}</div>
      </FilterSection>
      <FilterSection label="Condition">
        <div className="flex flex-wrap gap-1.5">{filters.conditions.map((c) => <Chip key={c} size="sm" active={draft.condition.includes(c)} onClick={() => set({ condition: toggleIn(draft.condition, c) })}>{condLabel(c)}</Chip>)}</div>
      </FilterSection>
      {filters.colors.length > 0 && (
        <FilterSection label="Colour">
          <div className="flex flex-wrap gap-2">
            {filters.colors.map((c) => (
              <button key={c} type="button" title={c} aria-label={c} onClick={() => set({ color: toggleIn(draft.color, c) })} className={cx('h-7 w-7 rounded-full border-2 transition-transform', draft.color.includes(c) ? 'scale-110 border-primary ring-2 ring-primary-050' : 'border-border-strong')} style={{ background: swatch(c) }} />
            ))}
          </div>
          {draft.color.length > 0 && <span className="text-[11px] text-ink-2">{draft.color.join(', ')}</span>}
        </FilterSection>
      )}
    </div>
  )
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex flex-col gap-3 p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-bold text-ink">{label}</span>
        {open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
      </button>
      {open && children}
    </div>
  )
}

// ------------------------------------------------------------------ list view row
function ListRow({ item }: { item: ItemCard }) {
  return (
    <Link to="/items/$id" params={{ id: String(item.id) }} className="flex gap-4 rounded-lg border border-border bg-bg p-3 transition-shadow hover:shadow-card">
      <div className="flex h-[120px] w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 md:h-[140px] md:w-[160px]">
        {item.image ? <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon size={30} className="text-border-strong" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          {item.is_verified ? <VerifiedBadge /> : <Chip size="sm" tone="warning">{item.on_shelve ? 'On shelf' : 'Seller direct'}</Chip>}
          <span className="truncate text-[11px] text-muted">{item.shelve_name || item.ward}</span>
        </div>
        <p className="m-0 line-clamp-2 text-sm font-medium text-ink">{item.title}</p>
        <Stars value={item.rating} count={item.rating_count} />
        <p className="m-0 font-head text-lg font-extrabold">{priceRange(item.min_amount, item.max_amount)}</p>
        <div className="flex items-center gap-2 text-[11px]">
          {item.old_amount ? <span className="text-muted line-through">{ksh(item.old_amount)}</span> : null}
          <span className="text-success">{item.sold_count} sold</span>
          {item.condition && <span className="text-muted">· {item.condition}</span>}
        </div>
      </div>
    </Link>
  )
}
