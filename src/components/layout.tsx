/**
 * Nav / Main Menu · Nav / Sub Menu · Nav / Category Bar (GSAP slide-down) · Footer ·
 * Mobile / Top Bar · Mobile / Bottom Tabs — all from docs/wireframe.pen
 */
import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Bell, ChevronDown, CirclePlus, Facebook, Grid3x3, HelpCircle, House, Instagram, LogOut, Menu, MessageCircle, Package, Search, ShoppingCart, SlidersHorizontal, Twitter, User as UserIcon, X, Youtube } from 'lucide-react'
import { api, COURIER_URL, DELIVERY_URL, SHELVES_URL, type Category } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useCart } from '#/lib/cart'
import { useMessages } from '#/lib/messages'
import { badgeCount, useNotifications } from '#/lib/notifications'
import { useToast } from '#/lib/toast'
import { categoryIcon } from '#/lib/icons'
import { AppLink, Button, Chip, Input, Textarea, cx } from './ui'

const MAIN_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: `${SHELVES_URL}/`, label: 'Apply For Shelve' },  // shelves app
  { to: `${DELIVERY_URL}/`, label: 'Apply For Delivery' },  // delivery app
  { to: '/blog', label: 'Blog' },
]

export function MainMenu() {
  const { user, logout } = useAuth()
  const { cart } = useCart()
  const { unread } = useNotifications()
  const { unread: unreadChats } = useMessages()
  const [open, setOpen] = useState(false)
  return (
    <div className="hidden w-full bg-primary md:block">
      <div className="container-x flex h-[46px] items-center justify-between">
        <nav className="flex items-center gap-[22px]">
          {MAIN_LINKS.map((l) => (
            <AppLink key={l.to} to={l.to} className="text-[13px] text-white text-[#fff] hover:text-white">{l.label}</AppLink>
          ))}
        </nav>
        <div className="flex items-center gap-[18px]">
          <Link to="/notifications" className="flex items-center gap-1.5 text-[13px] text-white/80 hover:text-white">
            <span className="relative"><Bell size={15} />{unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-secondary px-0.5 text-[9px] font-bold text-white">{badgeCount(unread)}</span>}</span> Notifications
          </Link>
          <Link to="/chat" className="flex items-center gap-1.5 text-[13px] text-white/80 hover:text-white">
            <span className="relative"><MessageCircle size={15} />{unreadChats > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-secondary px-0.5 text-[9px] font-bold text-white">{badgeCount(unreadChats)}</span>}</span> Messages
          </Link>
          <Link to="/cart" className="flex items-center gap-1.5 text-[13px] text-white/80 hover:text-white"><ShoppingCart size={15} /> Cart ({cart.summary.count})</Link>
          <span className="h-[18px] w-px bg-white/20" />
          {user ? (
            <div className="relative">
              <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[13px] text-white/90 hover:text-white">{user.name.split(' ')[0]} <ChevronDown size={13} /></button>
              {open && (
                <div onMouseLeave={() => setOpen(false)} className="absolute right-0 top-8 z-50 w-56 overflow-hidden rounded-md border border-border bg-bg py-1 text-[13px] text-ink shadow-card">
                  {/* Seller Dashboard only once he is a seller — the API flips that on his first posted ad. */}
                  {[['/orders', 'My Orders'], ['/profile', 'Profile'], ...(user.roles.seller ? [['/seller', 'Seller Dashboard']] : []), ...(user.roles.shelve_owner ? [[`${SHELVES_URL}/dashboard`, 'Shelve owner console']] : []), ...(user.roles.rider ? [[`${DELIVERY_URL}/dashboard`, 'Delivery partner']] : []), ...(user.roles.courier ? [[`${COURIER_URL}/dashboard`, 'Courier console']] : []), ['/chat', 'Messages'], ['/notifications', 'Notifications'], ['/settings', 'Settings']].map(([to, label]) => (
                    <AppLink key={to} to={to} onClick={() => setOpen(false)} className="block px-3.5 py-2 hover:bg-surface">{label}</AppLink>
                  ))}
                  <button type="button" onClick={() => { setOpen(false); logout() }} className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-danger hover:bg-surface"><LogOut size={14} /> Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/signin" className="text-[13px] text-white/80 hover:text-white">Sign In / Register</Link>
          )}
          <Link to="/post-ad" className="rounded-[8px] bg-secondary px-4 py-2 text-[13px] font-semibold text-white hover:bg-secondary-600">Post Ad</Link>
        </div>
      </div>
    </div>
  )
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      {/* <span className={cx('grad-brand flex items-center justify-center rounded-[9px] font-head font-extrabold text-white', size === 'sm' ? 'h-[26px] w-[26px] text-[11px]' : 'h-[34px] w-[34px] text-sm')}>U</span> */}
      <img src="/uko-cart-tile-512.png" alt="UKO shop" className={cx(size === 'sm' ? 'h-[26px] w-[26px]' : 'h-[34px] w-[34px]')} />
      <span className={cx('font-head font-extrabold tracking-tight text-ink', size === 'sm' ? 'text-base' : 'text-xl')}>UKO shop</span>
    </Link>
  )
}

export function SubMenu() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate({ to: '/items', search: { q } as any })
  }
  return (
    <div className="hidden w-full border-b border-border bg-bg md:block">
      <div className="container-x flex h-[78px] items-center gap-8">
        <Logo />
        <form onSubmit={submit} className="flex h-[46px] flex-1 items-center gap-2.5 rounded-md border border-border bg-surface pl-4 pr-1.5">
          <Search size={17} className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, shelves or sellers…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
          <Chip tone="primary" size="sm" onClick={() => setQ((s) => (s ? s : 'verified items near me'))}>Prompt insert</Chip>
          <Button type="submit" size="sm" className="!px-5 !py-2.5">Search</Button>
        </form>
        <Link to="/help" className="flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink"><HelpCircle size={18} /> Help</Link>
      </div>
    </div>
  )
}

/**
 * Category bar — 50px strip with icon categories, ellipsis at the end and an
 * "All categories" toggle that GSAP-slides a full panel down (height auto, pushes body).
 */
export function CategoryBar({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (!panel.current) return
    if (first.current) {
      first.current = false
      panel.current.style.height = '0px'
      panel.current.style.overflow = 'hidden'
      return
    }
    let cancelled = false
    import('gsap').then(({ gsap }) => {
      if (cancelled || !panel.current) return
      if (open) {
        gsap.to(panel.current, { height: 'auto', duration: 0.45, ease: 'power3.out', onComplete: () => { if (panel.current) panel.current.style.overflow = 'visible' } })
        gsap.fromTo(panel.current.querySelectorAll('[data-col]'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.04, delay: 0.1 })
      } else {
        panel.current.style.overflow = 'hidden'
        gsap.to(panel.current, { height: 0, duration: 0.35, ease: 'power2.inOut' })
      }
    })
    return () => { cancelled = true }
  }, [open])
  return (
    <div className="hidden w-full border-b border-border bg-bg md:block">
      <div className="container-x flex h-[50px] items-center gap-3">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {categories.map((c, i) => {
            const Icon = categoryIcon(c.icon)
            return (
              <Fragment key={c.id}>
                {i > 0 && <span aria-hidden className="h-4 w-px shrink-0 bg-border" />}
                <Link to="/items" search={{ category: c.slug } as any} className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface hover:text-primary">
                  <Icon size={15} /> {c.name}
                </Link>
              </Fragment>
            )
          })}
          <span className="px-1 text-muted">…</span>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className={cx('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors', open ? 'bg-primary text-white' : 'bg-primary-050 text-primary hover:bg-primary-300/30')}>
          All categories <ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      <div ref={panel} className="w-full border-t border-border bg-bg" style={{ height: 0, overflow: 'hidden' }}>
        <div className="container-x grid grid-cols-4 gap-x-6 gap-y-6 py-6">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon)
            return (
              <div key={c.id} data-col className="flex flex-col gap-2 border-l border-border pl-6 [&:nth-child(4n+1)]:border-l-0 [&:nth-child(4n+1)]:pl-0">
                <Link to="/items" search={{ category: c.slug } as any} onClick={() => setOpen(false)} className="flex items-center gap-2 font-head text-[14px] font-bold text-ink hover:text-primary"><Icon size={16} className="text-primary" /> {c.name}</Link>
                {c.children.map((s) => (
                  <div key={s.id} className="flex flex-col gap-1">
                    <Link to="/items" search={{ category: c.slug, sub: s.slug } as any} onClick={() => setOpen(false)} className="text-[13px] text-ink-2 hover:text-primary">{s.name}</Link>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {s.children.map((k) => (
                        <Link key={k.id} to="/items" search={{ category: c.slug, sub: s.slug, catalogue: k.slug } as any} onClick={() => setOpen(false)} className="text-[11px] text-muted hover:text-primary">{k.name}</Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function Footer() {
  const { success, error } = useToast()
  const [email, setEmail] = useState('')
  const [c, setC] = useState({ name: '', subject: '', body: '' })
  const subscribe = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/newsletter', { email })
      success('Subscribed — shelf drops & deals every week.')
      setEmail('')
    } catch (err: any) {
      error(err.message)
    }
  }
  const complain = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if(c && (!c.name || !c.subject || !c.body)) {
        error('Please fill in all fields.')
        return
      }
      await api.post('/complaints', c)
      success('Complaint received. We reply within 24 hours.')
      setC({ name: '', subject: '', body: '' })
    } catch (err: any) {
      error(err.message)
    }
  }
  return (
    <footer className="mt-12 w-full border-t border-border bg-surface pb-24 md:pb-0">
      <div className="container-x flex flex-col gap-8 py-8">
        <div className="grad-hero flex flex-col items-start justify-between gap-4 rounded-lg p-6 text-white md:flex-row md:items-center md:p-8">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl md:text-2xl">Get shelf drops & deals weekly</h3>
            <p className="m-0 text-sm text-white/80">New arrivals on shelves near you, plus boosted seller offers.</p>
          </div>
          <form onSubmit={subscribe} className="flex w-full gap-2 md:w-auto">
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="your@email.com" className="h-11 w-full rounded-md border border-white/20 bg-white/10 px-3.5 text-sm text-white outline-none placeholder:text-white/60 md:w-64" />
            <Button type="submit" variant="secondary">Subscribe</Button>
          </form>
        </div>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {[
            ['About UKO', [['/about', 'Our story'], ['/about', 'How UKO shop works'], ['/terms', 'Terms and conditions'], ['/about', 'Careers'], ['/about', 'Press']]],
            ['Blogs', [['/blog', 'Seller stories'], ['/blog', 'Market trends'], ['/blog', 'Shelf spotlights']]],
            ['How To', [['/post-ad', 'Post an ad'], ['/help', 'Boost on the UKOapp ad site'], [`${SHELVES_URL}/`, 'Drop items at a shelf'], ['/orders', 'Track a delivery']]],
          ].map(([h, links]) => (
            <div key={h as string} className="flex flex-col gap-2.5">
              <h4 className="text-sm font-bold">{h as string}</h4>
              {(links as string[][]).map(([to, label], i) => <AppLink key={i} to={to} className="text-[13px] text-ink-2 hover:text-primary">{label}</AppLink>)}
            </div>
          ))}
          <div className="flex flex-col gap-2.5">
            <h4 className="text-sm font-bold">Contact</h4>
            <a href="mailto:support@uko-app.co.ke" className="text-[13px] text-ink-2 hover:text-primary">support@uko-app.co.ke</a>
            <a href="tel:0700000000" className="text-[13px] text-ink-2 hover:text-primary">0717 323 852</a>
            <span className="text-[13px] text-ink-2">Nairobi, Kenya</span>
          </div>
          <form onSubmit={complain} className="col-span-2 flex flex-col gap-2.5 md:col-span-1">
            <h4 className="text-sm font-bold">Report a complaint</h4>
            <Input placeholder="Your name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} required />
            <Input placeholder="Subject" value={c.subject} onChange={(e) => setC({ ...c, subject: e.target.value })} required />
            <Textarea placeholder="Describe the issue" value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} required rows={2} />
            <Button type="submit" variant="outline" size="sm">Submit complaint</Button>
          </form>
        </div>
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted md:flex-row">
          <span>© 2026 UKO · shop · ad site · eden</span>
          <div className="flex gap-4 text-ink-2">
            <Facebook size={16} /> <Twitter size={16} /> <Instagram size={16} /> <Youtube size={16} />
          </div>
        </div>
      </div>
    </footer>
  )
}

export function MobileTopBar({ categories }: { categories: Category[] }) {
  const navigate = useNavigate()
  const { cart } = useCart()
  const { user, logout } = useAuth()
  const { unread } = useNotifications()
  const { unread: unreadChats } = useMessages()
  const [menu, setMenu] = useState(false)
  const [q, setQ] = useState('')
  const loc = useLocation()
  useEffect(() => setMenu(false), [loc.pathname])
  return (
    <div className="sticky top-0 z-40 w-full border-b border-border bg-bg md:hidden">
      <div className="flex h-[52px] items-center gap-3 px-3.5">
        <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Menu">{menu ? <X size={20} /> : <Menu size={20} />}</button>
        <div className="flex-1"><Logo size="sm" /></div>
        <Link to="/chat" aria-label={unreadChats > 0 ? `Messages (${unreadChats} unread)` : 'Messages'} className="relative"><MessageCircle size={19} />{unreadChats > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-white">{badgeCount(unreadChats)}</span>}</Link>
        <Link to="/notifications" aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'} className="relative"><Bell size={19} />{unread > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-white">{badgeCount(unread)}</span>}</Link>
        <Link to="/cart" aria-label="Cart" className="relative"><ShoppingCart size={19} />{cart.summary.count > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-white">{cart.summary.count}</span>}</Link>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); navigate({ to: '/items', search: { q } as any }) }} className="flex gap-2 px-3.5 pb-3">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3">
          <Search size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items or shelves" className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted" />
        </div>
        <Link to="/items" className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-050 text-primary-600" aria-label="Filters"><SlidersHorizontal size={16} /></Link>
      </form>
      {menu && (
        <div className="max-h-[70vh] overflow-y-auto border-t border-border bg-bg px-4 py-3">
          <div className="grid grid-cols-4 gap-2 pb-3">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon)
              return (
                <Link key={c.id} to="/items" search={{ category: c.slug } as any} className="flex flex-col items-center gap-1.5 rounded-md bg-surface p-2 text-center text-[11px] text-ink-2">
                  <Icon size={18} className="text-primary" /> {c.name}
                </Link>
              )
            })}
          </div>
          <div className="flex flex-col divide-y divide-border text-sm">
            {MAIN_LINKS.map((l) => <AppLink key={l.to} to={l.to} className="py-2.5">{l.label}</AppLink>)}
            <Link to="/post-ad" className="py-2.5 font-semibold text-secondary-600">Post Ad</Link>
            {user ? (
              <>
                <Link to="/orders" className="py-2.5">My orders</Link>
                <Link to="/profile" className="py-2.5">Profile</Link>
                {user.roles.seller && <Link to="/seller" className="py-2.5">Seller items page</Link>}
                {user.roles.shelve_owner && <a href={`${SHELVES_URL}/dashboard`} className="py-2.5">Shelve owner console</a>}
                {user.roles.rider && <a href={`${DELIVERY_URL}/dashboard`} className="py-2.5">Delivery partner</a>}
                {user.roles.courier && <a href={`${COURIER_URL}/dashboard`} className="py-2.5">Courier console</a>}
                <button type="button" onClick={logout} className="py-2.5 text-left text-danger">Sign out</button>
              </>
            ) : (
              <Link to="/signin" className="py-2.5">Sign In / Register</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function MobileBottomTabs() {
  const { pathname } = useLocation()
  const tabs = [
    { to: '/', label: 'Home', Icon: House },
    { to: '/items', label: 'Categories', Icon: Grid3x3 },
    { to: '/post-ad', label: 'Post ad', Icon: CirclePlus },
    { to: '/orders', label: 'Orders', Icon: Package },
    { to: '/account', label: 'Account', Icon: UserIcon },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[66px] border-t border-border bg-bg px-2.5 pt-[9px] md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(({ to, label, Icon }) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
        return (
          <Link key={to} to={to as any} className={cx('flex flex-1 flex-col items-center gap-1 text-[10px]', active ? 'font-bold text-primary' : 'font-medium text-muted')}>
            <Icon size={20} /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
