/** Blog — seller stories, market trends, shelf spotlights — /blog */
import { createFileRoute } from '@tanstack/react-router'
import { Clock, Rss } from 'lucide-react'
import { Chip } from '#/components/ui'

export const Route = createFileRoute('/blog')({ component: BlogPage })

type Post = { id: number; title: string; excerpt: string; date: string; read: string; author: string }
type Group = { key: string; title: string; sub: string; tone: 'primary' | 'secondary' | 'success'; posts: Post[] }

const GROUPS: Group[] = [
  {
    key: 'sellers',
    title: 'Seller stories',
    sub: 'People who sold their first item on a shelf — and kept going.',
    tone: 'primary',
    posts: [
      { id: 1, title: 'From one phone to forty: how Amina built a Kasarani electronics side-hustle', excerpt: 'She dropped a used Galaxy at the Kasarani shelf in March. Six months later she keeps 12 slots full and boosts on the UKOapp ad site every weekend.', date: '4 Sep 2026', read: '5 min', author: 'UKO team' },
      { id: 2, title: 'Selling Ankara dresses without a stall: Wanjiru on verification and trust', excerpt: 'Buyers used to ask for a video call before paying. Now the green badge does the talking.', date: '21 Aug 2026', read: '4 min', author: 'UKO team' },
    ],
  },
  {
    key: 'trends',
    title: 'Market trends',
    sub: 'What is moving on shelves across Kenya this month.',
    tone: 'secondary',
    posts: [
      { id: 3, title: 'Back-to-school: solar lamps and tablets lead August shelf sales', excerpt: 'Westlands and Kilimani shelves cleared 40% more electronics than July. Here is the full category breakdown.', date: '30 Aug 2026', read: '6 min', author: 'Data desk' },
      { id: 4, title: 'Why boosted listings sell 3x faster on Friday nights', excerpt: 'We looked at 8,000 boosts on the UKOapp ad site. The window between 7 pm and 11 pm does most of the work.', date: '12 Aug 2026', read: '3 min', author: 'Data desk' },
    ],
  },
  {
    key: 'shelves',
    title: 'Shelf spotlights',
    sub: 'Meet the hosts keeping every ward supplied.',
    tone: 'success',
    posts: [
      { id: 5, title: "Inside Kilimani Shelf 01: a pharmacy that became the ward's pickup point", excerpt: 'Host Peter Otieno runs 30 slots beside his counter and says his cut of each sale now covers his rent.', date: '7 Aug 2026', read: '4 min', author: 'UKO team' },
      { id: 6, title: 'Nyali shelf goes live: first coastal ward joins the network', excerpt: 'Mombasa sellers can now drop, verify and deliver locally. Here is what the launch week looked like.', date: '25 Jul 2026', read: '3 min', author: 'UKO team' },
    ],
  },
]

const img = (n: number) => `https://picsum.photos/seed/blog-${n}/640/400`

function BlogPage() {
  const featured = GROUPS[0].posts[0]
  return (
    <div className="flex flex-col pb-6">
      <div className="w-full border-b border-border bg-surface">
        <div className="container-x flex flex-col gap-1.5 py-6 md:py-8">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-050 px-2.5 py-1 text-[11px] font-semibold text-primary"><Rss size={12} /> UKO blog</span>
          <h1 className="text-[26px] leading-tight md:text-[30px]">Stories from the shelves</h1>
          <p className="m-0 max-w-xl text-sm text-ink-2">Seller wins, what is selling where, and the hosts behind every ward.</p>
        </div>
      </div>

      <div className="container-x flex flex-col gap-10 pt-6 md:gap-14 md:pt-8">
        {/* Featured */}
        <a href={`#post-${featured.id}`} className="group grid overflow-hidden rounded-lg border border-border bg-bg transition-shadow hover:shadow-card md:grid-cols-[1.2fr_1fr]">
          <div className="h-[200px] overflow-hidden bg-surface-2 md:h-full md:min-h-[300px]">
            <img src={img(featured.id)} alt="" loading="eager" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          </div>
          <div className="flex flex-col justify-center gap-3 p-5 md:p-8">
            <div className="flex items-center gap-2"><Chip size="sm" tone="primary">Featured</Chip><Chip size="sm" tone="neutral">Seller stories</Chip></div>
            <h2 className="text-[22px] leading-snug md:text-[26px]">{featured.title}</h2>
            <p className="m-0 text-sm leading-relaxed text-ink-2">{featured.excerpt}</p>
            <Meta post={featured} />
          </div>
        </a>

        {GROUPS.map((g) => (
          <section key={g.key} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl md:text-2xl">{g.title}</h2>
              <p className="m-0 text-[13px] text-ink-2">{g.sub}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.posts.map((p) => (
                <a key={p.id} id={`post-${p.id}`} href={`#post-${p.id}`} className="group flex flex-col overflow-hidden rounded-lg border border-border bg-bg transition-shadow hover:shadow-card">
                  <div className="h-[168px] overflow-hidden bg-surface-2">
                    <img src={img(p.id)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 p-4">
                    <Chip size="sm" tone={g.tone}>{g.title}</Chip>
                    <h3 className="line-clamp-2 text-[15px] leading-snug">{p.title}</h3>
                    <p className="m-0 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{p.excerpt}</p>
                    <div className="mt-auto pt-1"><Meta post={p} /></div>
                  </div>
                </a>
              ))}
              <div className="grad-soft flex flex-col justify-center gap-2 rounded-lg p-5 sm:col-span-2 lg:col-span-1">
                <span className="text-[13px] font-bold text-ink">More {g.title.toLowerCase()} soon</span>
                <p className="m-0 text-xs text-ink-2">Have a story worth telling? Write to press@uko.co.ke and we will feature it here.</p>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Meta({ post }: { post: Post }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="font-medium text-ink-2">{post.author}</span>
      <span>{post.date}</span>
      <span className="flex items-center gap-1"><Clock size={11} /> {post.read} read</span>
    </div>
  )
}
