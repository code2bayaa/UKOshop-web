/** Shelves near you — three verified shelves per ward — /shelves */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { MapPin, Store } from 'lucide-react'
import { publicGet, SHELVES_URL, type Shelve } from '#/lib/api'
import { ShelfCard } from '#/components/cards'
import { Button, EmptyState, LinkButton, Select } from '#/components/ui'

type ShelvesSearch = { ward?: string }
type Wards = { wards: string[]; counties: string[] }

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

export const Route = createFileRoute('/shelves/')({
  validateSearch: (raw: Record<string, unknown>): ShelvesSearch => ({ ward: str(raw.ward) }),
  loaderDeps: ({ search }) => ({ ward: search.ward }),
  loader: async ({ deps }) => {
    const [shelves, wards] = await Promise.all([
      publicGet<Shelve[]>('/shelves', { ward: deps.ward }),
      publicGet<Wards>('/wards').catch(() => ({ wards: [], counties: [] }) as Wards),
    ])
    return { shelves, wards }
  },
  component: ShelvesPage,
})

function ShelvesPage() {
  const { shelves, wards } = Route.useLoaderData()
  const { ward } = Route.useSearch()
  const navigate = useNavigate({ from: '/shelves/' })
  const setWard = (w: string) => navigate({ search: { ward: w || undefined } })

  return (
    <div className="flex flex-col pb-6">
      {/* Header strip */}
      <div className="w-full border-b border-border bg-surface">
        <div className="container-x flex flex-col gap-4 py-6 md:flex-row md:items-end md:justify-between md:py-8">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-050 px-2.5 py-1 text-[11px] font-semibold text-primary"><MapPin size={12} /> {shelves.length} live {shelves.length === 1 ? 'shelf' : 'shelves'}{ward ? ` in ${ward}` : ' across Kenya'}</span>
            <h1 className="text-[26px] leading-tight md:text-[30px]">Shelves near you</h1>
            <p className="m-0 text-sm text-ink-2">Three verified shelves per ward — drop off your item, store it, and deliver from there.</p>
          </div>
          <Select value={ward || ''} onChange={(e) => setWard(e.target.value)} placeholder="All wards" className="w-full md:w-[240px]" aria-label="Filter by ward">
            {wards.wards.map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
        </div>
      </div>

      <div className="container-x flex flex-col gap-8 pt-6 md:gap-10 md:pt-8">
        {shelves.length === 0 ? (
          <EmptyState
            icon={<Store size={28} />}
            title={ward ? `No live shelf in ${ward} yet` : 'No live shelves yet'}
            sub={ward ? 'Every ward gets three verified shelves. Be the first to host one, or browse shelves in other wards.' : 'Shelves go live after the host is verified. Check back soon or apply to host the first one.'}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {ward && <Button variant="outline" size="sm" onClick={() => setWard('')}>Show all wards</Button>}
                <LinkButton href={`${SHELVES_URL}/`} size="sm">Apply to host a shelf</LinkButton>
              </div>
            }
          />
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl md:text-2xl">{ward ? `${ward} ward` : 'All live shelves'}</h2>
                <p className="m-0 text-[13px] text-ink-2">Storage is free at every shelf — hosts are paid a share of each sale instead. Delivery fees are set by each host, and capacity updates as items are dropped and claimed.</p>
              </div>
              {ward && <button type="button" onClick={() => setWard('')} className="text-xs font-semibold text-secondary-600 hover:underline">Clear ward</button>}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {shelves.map((s) => <ShelfCard key={s.id} shelve={s} />)}
            </div>
          </section>
        )}

        {/* CTA banner */}
        <section className="grad-hero flex flex-col items-start justify-between gap-5 rounded-lg p-6 text-white md:flex-row md:items-center md:p-10">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl md:text-[28px]">Your ward has no shelf? Host it.</h2>
            <p className="m-0 max-w-xl text-sm text-white/80">Shop owners earn 15% of every item sold off their shelf, plus a share of delivery fees. Three shelves per ward — apply before the last slot goes.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <LinkButton href={`${SHELVES_URL}/`} variant="secondary">Apply for a shelve</LinkButton>
            <Link to={'/about' as any} className="inline-flex items-center justify-center rounded-md border border-white/40 px-[22px] py-[13px] text-sm font-semibold text-white hover:bg-white/10">How it works</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
