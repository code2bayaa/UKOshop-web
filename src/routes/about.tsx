/** About UKO shop — /about */
import { createFileRoute, Link } from '@tanstack/react-router'
import { Briefcase, Clapperboard, Lock, Newspaper, Package, Percent, Rocket, ShieldCheck, Truck } from 'lucide-react'
import { Card, Chip, LinkButton } from '#/components/ui'

export const Route = createFileRoute('/about')({ component: AboutPage })

const STEPS = [
  { Icon: Package, n: '01', t: 'Drop at a shelf', s: 'Post an ad, then take the item to the verified shelf in your ward. The host scans it in and it is held for you.' },
  { Icon: ShieldCheck, n: '02', t: 'Verified on arrival', s: 'The shelf host checks condition and photos against your ad. Only verified items get the green badge buyers trust.' },
  { Icon: Clapperboard, n: '03', t: 'Marketed on the UKOapp ad site', s: 'Boost your listing onto the UKOapp ad site — unlimited viewers, KSh 500 for every 1,000 views, with a link back to your ad. You can also run an ad there only, with no UKOshop listing at all.' },
  { Icon: Lock, n: '04', t: 'Escrow & delivery', s: 'Buyers pay into escrow. Money is released when they claim at the shelf with ID or enter the 4-digit delivery code.' },
]

const MONEY = [
  { Icon: Percent, t: '20% commission', s: 'Charged only when a shelf item sells. No listing fee, no monthly fee for casual sellers.' },
  { Icon: Clapperboard, t: 'Boosts', s: 'UKOapp ad site KSh 500 per 1,000 views · shop search KSh 300 per county per day, 2 days · home carousel KSh 1,000 per county per day, 5 days. One rate countrywide, charged for every county the boost runs in, and each county has a fixed number of slots a day (3 carousel slots in Nairobi). Views bought in blocks of 1,000. Paid by M-PESA.' },
  { Icon: Rocket, t: 'Seller packages', s: 'Starter, Pro and Store tiers unlock more live ads, AI product images (KSh 500 for 5 prompts) and lower storage rates.' },
]

const ROLES = [
  { title: 'Shelf operations lead', where: 'Nairobi · full-time', tag: 'Operations' },
  { title: 'Rider community manager', where: 'Mombasa · full-time', tag: 'Delivery' },
  { title: 'Frontend engineer (React)', where: 'Remote · Kenya', tag: 'Engineering' },
  { title: 'Trust & safety analyst', where: 'Nairobi · hybrid', tag: 'Trust' },
]

const PRESS = [
  { outlet: 'Business Daily', date: 'Aug 2026', title: 'UKO shop turns ward kiosks into verified pickup points' },
  { outlet: 'TechCabal', date: 'Jun 2026', title: 'How a content app became a marketplace for Nairobi sellers' },
  { outlet: 'Nation', date: 'Mar 2026', title: 'Three shelves a ward: the last-mile bet paying off for small traders' },
]

function AboutPage() {
  return (
    <div className="flex flex-col gap-10 pb-6 md:gap-14">
      {/* Hero */}
      <section className="grad-hero w-full text-white">
        <div className="container-x flex flex-col gap-5 py-10 md:py-14">
          <Chip size="sm" className="w-fit bg-white/15 !text-white">Our story</Chip>
          <h1 className="max-w-2xl text-[30px] leading-[1.1] tracking-tight md:text-[42px]">We built the shop for people who do not have one.</h1>
          <p className="m-0 max-w-2xl text-[15px] text-white/85">UKO started as a content app in Nairobi. Viewers kept asking sellers in the comments where to buy what they saw on screen — and sellers kept getting scammed meeting strangers. So we put a verified shelf in every ward, an escrow between buyer and seller, and a rider between the two.</p>
          <div className="flex flex-wrap gap-8 border-t border-white/15 pt-5">
            {[['2024', 'founded'], ['22', 'wards live'], ['1,290', 'verified sellers'], ['98%', 'delivered in 48h']].map(([v, l]) => (
              <div key={l} className="flex flex-col">
                <span className="font-head text-2xl font-extrabold">{v}</span>
                <span className="text-xs text-white/70">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container-x flex flex-col gap-10 md:gap-14">
        {/* How it works */}
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] md:text-2xl">How UKO shop works</h2>
            <p className="m-0 text-[13px] text-ink-2">Four steps from your bedroom to a buyer's hands — without ever meeting a stranger.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ Icon, n, t, s }) => (
              <Card key={n} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={18} /></span>
                  <span className="font-head text-2xl font-extrabold text-border-strong">{n}</span>
                </div>
                <h3 className="text-[15px]">{t}</h3>
                <p className="m-0 text-[13px] leading-relaxed text-ink-2">{s}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Money */}
        <section className="grad-soft flex flex-col gap-5 rounded-lg p-6 md:p-10">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] md:text-2xl">How we make money — and how you do</h2>
            <p className="m-0 text-[13px] text-ink-2">No hidden fees. Everything we charge is listed here and shown again before you pay.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {MONEY.map(({ Icon, t, s }) => (
              <div key={t} className="flex flex-col gap-2.5 rounded-lg border border-border bg-bg p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary-050 text-secondary-600"><Icon size={18} /></span>
                <h3 className="text-[15px]">{t}</h3>
                <p className="m-0 text-[13px] leading-relaxed text-ink-2">{s}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-2">
            <span className="flex items-center gap-1.5"><Truck size={13} className="text-muted" /> Delivery fees are set per shelf and paid to the rider</span>
            <span className="flex items-center gap-1.5"><Percent size={13} className="text-muted" /> Shelves and riders pay a 10% fee on M-PESA withdrawals · sellers withdraw free</span>
            <span className="flex items-center gap-1.5"><Lock size={13} className="text-muted" /> Escrow is free for buyers and sellers</span>
            <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-muted" /> Storage is charged per day after the free 24-hour hold</span>
          </div>
        </section>

        {/* Careers + Press */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-[22px] md:text-2xl"><Briefcase size={20} className="text-primary" /> Careers</h2>
                <p className="m-0 text-[13px] text-ink-2">Small team, big wards. We hire people who have sold something on the street.</p>
              </div>
            </div>
            <Card padded={false} className="divide-y divide-border">
              {ROLES.map((r) => (
                <div key={r.title} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-ink">{r.title}</span>
                    <span className="text-xs text-ink-2">{r.where}</span>
                  </div>
                  <Chip size="sm" tone="primary">{r.tag}</Chip>
                </div>
              ))}
              <div className="px-5 py-4">
                <a href="mailto:careers@uko.co.ke" className="text-[13px] font-semibold text-primary hover:underline">Send your CV to careers@uko.co.ke →</a>
              </div>
            </Card>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="flex items-center gap-2 text-[22px] md:text-2xl"><Newspaper size={20} className="text-primary" /> Press</h2>
              <p className="m-0 text-[13px] text-ink-2">Recent coverage. For interviews and media kits write to press@uko.co.ke.</p>
            </div>
            <div className="flex flex-col gap-3">
              {PRESS.map((p) => (
                <Card key={p.title} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted"><span className="font-semibold text-ink-2">{p.outlet}</span> · {p.date}</div>
                  <p className="m-0 text-sm font-medium text-ink">{p.title}</p>
                </Card>
              ))}
            </div>
          </section>
        </div>

        {/* CTA */}
        <section className="grad-hero flex flex-col items-start justify-between gap-5 rounded-lg p-6 text-white md:flex-row md:items-center md:p-10">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl md:text-[28px]">Ready to sell without a shop?</h2>
            <p className="m-0 max-w-xl text-sm text-white/80">Post your first ad in two minutes, or find the shelf in your ward.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <LinkButton to={'/post-ad' as any} variant="secondary">Post an ad</LinkButton>
            <Link to="/shelves" className="inline-flex items-center justify-center rounded-md border border-white/40 px-[22px] py-[13px] text-sm font-semibold text-white hover:bg-white/10">Find a shelf</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
