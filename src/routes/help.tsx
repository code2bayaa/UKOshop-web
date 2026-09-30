/** Help centre — how-to articles + FAQ — /help */
import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronDown, Clapperboard, LifeBuoy, Package, Store, Truck } from 'lucide-react'
import { Card, LinkButton, cx } from '#/components/ui'

export const Route = createFileRoute('/help')({ component: HelpPage })

const HOWTO = [
  {
    key: 'post', Icon: Package, title: 'Post an ad', sub: 'Two minutes from photos to a live listing.',
    steps: [
      ['Add photos and a title', 'Up to 8 images or a short video. Clear, well-lit photos on a plain background get verified faster.'],
      ['Set price, condition and variants', 'Add sizes or colours if you have them. You can set an old price to show a discount.'],
      ['Choose a shelf or sell direct', 'Pick the verified shelf in your ward, or sell directly and meet the buyer yourself (no escrow).'],
      ['Publish and drop the item', 'Your ad is pending until the shelf host scans it in. Then it goes live with the green badge.'],
    ],
  },
  {
    key: 'boost', Icon: Clapperboard, title: 'Boost on the UKOapp ad site', sub: 'Put your listing in front of unlimited viewers, not just shoppers.',
    steps: [
      ['Pick a channel when you post (or from your Seller page)', 'UKOapp ad site KSh 500 per 1,000 views · shop search & categories KSh 300 per county per day (2 days) · home carousel KSh 1,000 per county per day (5 days). The same rate in every county, and each county has a limited number of slots a day. Only live items are boosted.'],
      ['Or run the ad on the UKOapp ad site only', 'On the Post ad page choose “UKOapp ad site only”: the ad never appears in UKOshop search, categories, the home page or shelves — it runs on the ad site and you pay KSh 500 for every 1,000 views.'],
      ['Choose how many views (and where)', 'Ad site views are bought in blocks of 1,000, minimum 1,000. Shop channels are still per day, minimum 1 day. The first 3 wards are included; each extra ward costs KSh 50. Leave wards empty to run everywhere.'],
      ['Pay in KSh up front', 'M-PESA — charged when you post the ad (simulated until payment gateways are configured). An ad site ad stops once the views you paid for are delivered.'],
      ['Watch it run', 'The ad site reports views back to your Seller page. Check the analytics for your best days.'],
    ],
  },
  {
    key: 'drop', Icon: Store, title: 'Drop items at a shelf', sub: 'What happens when you hand your item to a host.',
    steps: [
      ['Find your ward shelf', 'Every ward has three verified shelves. Check opening hours and free slots on each one’s page.'],
      ['Bring the item and your ad code', 'The host scans the code, checks the item against your photos and confirms condition.'],
      ['Item is verified and stored', 'Your listing goes live. Storage is free for the first 24 hours, then the per-day fee shown on the shelf applies.'],
    ],
  },
  {
    key: 'track', Icon: Truck, title: 'Track a delivery', sub: 'From shelf to doorstep, with a code at both ends.',
    steps: [
      ['Get your tracking number', 'It is on the order confirmation and in My orders. The rider is assigned within the delivery window.'],
      ['Follow the rider live', 'The tracking page shows pickup, on-the-way and arrival events and the rider\'s phone.'],
      ['Share the 4-digit confirm code', 'Give the rider the code only when the item is in your hands. That releases escrow to the seller.'],
      ['Report a problem within 24 hours', 'Wrong or damaged item? Open a dispute from the order before the code is entered, or contact support.'],
    ],
  },
]

const FAQ = [
  { q: 'How does escrow work?', a: 'When you pay, the money is held by UKO — not the seller. It is released only after you claim the item at the shelf with your ID, or after you enter the 4-digit delivery code with the rider. If the item never reaches you, the money comes back.' },
  { q: 'What is a claim code and where do I find it?', a: 'A claim code is issued for shelf pickups. It is on your order confirmation, in My orders, and in the SMS we send. Show it with your ID at the shelf; the host marks the order claimed and the seller is paid.' },
  { q: 'What is the 24-hour holding rule?', a: 'After you pay for a shelf item it is held for you for 24 hours. Storage is free and you are never charged for extra days — but do collect it promptly: after 7 days the order is cancelled and refunded in full.' },
  { q: 'How do refunds work?', a: 'If you cancel before the item is picked up or dispatched, the full escrow amount is refunded to the payment method you used, usually within 2 working days for M-Pesa. Disputes opened after delivery are reviewed by support within 48 hours.' },
  { q: 'How much does a boost cost?', a: 'The UKOapp ad site is paid per view: KSh 500 for every 1,000 views, bought in blocks of 1,000 and charged up front — the ad runs until those views are delivered. The two shop channels are bought by county at the same rate everywhere: KSh 300 a day per county for shop search & categories, KSh 1,000 a day per county for the home carousel. Pick three counties and you pay for three, because the ad runs in all three. They also run for different lengths — 2 days on search and 5 in the carousel to start with, and you can set any number of days from 1. Viewers on the UKOapp ad site are unlimited, and views are reported back to your Seller page.' },
  { q: 'Why can I not buy a carousel boost today?', a: 'Because that county is full. Only so many boosts run in a county on one day — 3 home carousel slots and 12 search slots in Nairobi, 2 and 8 in Mombasa, 1 and 6 in Kisumu, Nakuru and Uasin Gishu, 1 and 4 anywhere else — so that a boosted ad is actually seen. When they are taken the boost form says so: drop that channel, pick another county, or come back tomorrow. A boost you start paying for holds its slot for 15 minutes while the M-PESA prompt is on your phone.' },
  { q: 'Whose boosted ads do I see in the home carousel?', a: 'The ones bought for your county. If no seller has bought a carousel slot in your county today, UKOshop shows the Nairobi ones instead, then the Mombasa ones. If nobody is running a carousel boost in any of those, the carousel simply runs UKO\'s own slides with no boosted ad in it.' },
  { q: 'Can I run an ad on the UKOapp ad site only?', a: 'Yes. On the Post ad page pick “UKOapp ad site only” under “Where this ad appears”. The ad is never listed in UKOshop search, categories, the home page or shelf pages — it runs on the UKOapp ad site alone and costs KSh 500 for every 1,000 views. Viewers who tap it on the ad site are sent to the ad’s page, so buyers can still contact you.' },
  { q: 'What does UKO charge sellers?', a: 'A 20% commission on shelf sales, taken from the escrow amount when it is released. Direct sales (no shelf, no escrow) are free. Shop boosts are paid per day in KSh at the rate of the county they target, the UKOapp ad site is paid at KSh 500 per 1,000 views (both by M-PESA), and AI images cost KSh 500 for 5 prompts.' },
  { q: 'Is there a fee to withdraw my earnings?', a: 'Sellers withdraw to M-PESA free of charge. Shelf hosts and delivery riders pay a 10% withdrawal fee, deducted from the amount withdrawn — a KSh 1,000 withdrawal sends KSh 900 to your M-PESA. The minimum withdrawal is KSh 100 and the breakdown is shown before you confirm.' },
]

function HelpPage() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="flex flex-col pb-6">
      <section className="grad-hero w-full text-white">
        <div className="container-x flex flex-col gap-3 py-9 md:py-12">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white"><LifeBuoy size={12} /> Help centre</span>
          <h1 className="text-[28px] leading-tight md:text-[36px]">How can we help?</h1>
          <p className="m-0 max-w-xl text-[15px] text-white/85">Step-by-step guides for sellers and buyers, plus answers on escrow, codes and refunds.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {HOWTO.map((h) => <a key={h.key} href={`#${h.key}`} className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">{h.title}</a>)}
            <a href="#faq" className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">FAQ</a>
          </div>
        </div>
      </section>

      <div className="container-x flex flex-col gap-10 pt-8 md:gap-14 md:pt-10">
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] md:text-2xl">How to</h2>
            <p className="m-0 text-[13px] text-ink-2">The four things most people do on UKO shop, in order.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {HOWTO.map(({ key, Icon, title, sub, steps }) => (
              <Card key={key} className="flex scroll-mt-24 flex-col gap-4" >
                <div id={key} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={18} /></span>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-base">{title}</h3>
                    <p className="m-0 text-xs text-ink-2">{sub}</p>
                  </div>
                </div>
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {steps.map(([t, s], i) => (
                    <li key={t} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-ink-2">{i + 1}</span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-semibold text-ink">{t}</span>
                        <span className="text-xs leading-relaxed text-ink-2">{s}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </section>

        <section id="faq" className="flex scroll-mt-24 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] md:text-2xl">Frequently asked</h2>
            <p className="m-0 text-[13px] text-ink-2">Money, codes and what happens when something goes wrong.</p>
          </div>
          <Card padded={false} className="divide-y divide-border">
            {FAQ.map((f, i) => {
              const isOpen = open === i
              return (
                <div key={f.q}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                    <span className="text-sm font-semibold text-ink">{f.q}</span>
                    <ChevronDown size={16} className={cx('shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && <p className="fade-up m-0 px-5 pb-5 text-[13px] leading-relaxed text-ink-2">{f.a}</p>}
                </div>
              )
            })}
          </Card>
        </section>

        <section className="grad-soft flex flex-col items-start justify-between gap-4 rounded-lg p-6 md:flex-row md:items-center md:p-8">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl md:text-2xl">Still stuck?</h2>
            <p className="m-0 text-[13px] text-ink-2">Support replies within one working day — faster for delivery issues.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <LinkButton to={'/contact' as any}>Contact support</LinkButton>
            <Link to="/shelves" className="inline-flex items-center justify-center rounded-md border border-border-strong px-[22px] py-[13px] text-sm font-semibold text-ink hover:bg-bg">Find a shelf</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
