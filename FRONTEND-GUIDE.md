# UKO shop front-end — conventions

Stack: TanStack Start (file router, SSR) · React 19 · Tailwind v4 · lucide-react · GSAP · CKEditor 5.
API: FastAPI at `VITE_API_URL` (default http://localhost:8000), all routes under `/api`.
Shelves app: `VITE_SHELVES_URL` (default http://localhost:3012), exported as `SHELVES_URL` from `#/lib/api`. "Apply for a shelve" (`${SHELVES_URL}/`)
and the shelf-owner console (`${SHELVES_URL}/dashboard`) live there, not in this app — link to them with a plain `<a href>`,
`LinkButton href=…` or `AppLink` (renders `<a>` for http(s) URLs), never TanStack `<Link to>`.
Delivery app: `VITE_DELIVERY_URL` (default http://localhost:3014), exported as `DELIVERY_URL`. "Apply for delivery" (`${DELIVERY_URL}/`) and the
rider dashboard (`${DELIVERY_URL}/dashboard`) live there — link to them the same way.
Design source: `docs/wireframe.pen` — text dumps of every frame live in `C:\Users\USER\AppData\Local\Temp\uko-pen\*.txt`
(desktop frames `01_…` – `17_…`, mobile `M1_…` – `M8_…`). Match those layouts, copy and section order.

## Tokens (Tailwind classes)
Colours: `primary primary-600 primary-300 primary-050 secondary secondary-600 secondary-050 bg surface surface-2 border border-strong ink ink-2 muted success success-050 warning warning-050 danger danger-050`
→ e.g. `bg-primary text-white`, `text-ink-2`, `border-border`, `bg-surface`.
Fonts: headings use `font-head` (Plus Jakarta Sans 800) automatically via h1–h4; body is Inter.
Radii: `rounded-sm` 6px · `rounded-md` 10px · `rounded-lg` 16px. Gradients: `.grad-hero`, `.grad-soft`, `.grad-brand`.
Content column: `<div className="container-x">` (max 1200px, ≈80 % on 1440).

## Shared code
- `#/lib/api.ts` — `api.get/post/put/patch/del/upload`, `publicGet` (for route loaders, SSR), all TS types (`ItemCard`, `ItemFull`, `Order`, `Delivery`, `Shelve`, `User`, `Cart`…). Errors throw `ApiError` with `.message` from the server.
- `#/lib/auth.tsx` — `useAuth()` → `{ user, ready, login, register, logout, refresh }`. `user.roles.{seller,shelve_owner,rider}` (`admin` is always false here).
- `#/lib/cart.tsx` — `useCart()` → `{ cart, add, update, remove, clear, applyPromo, recheck, refresh }`.
- `#/lib/toast.tsx` — `useToast()` → `{ success, error, toast }`.
- `#/lib/format.ts` — `ksh()`, `priceRange()`, `timeAgo()`, `fmtDate()`, `discountPct()`, `STATUS_LABEL`.
- `#/components/ui.tsx` — `Button, LinkButton (`to` route or `href` external URL), AppLink, isExternalUrl, Chip, VerifiedBadge, StatusPill, Input, Select, Textarea, Checkbox, Radio, Toggle, QtyStepper, CodeDigits, Card, StatCard, SectionHead, PageTitle, Stars, Tabs, Skeleton, EmptyState, Notice, Divider, Avatar, CheckoutStepper, Breadcrumbs, Spinner, PageLoading, KeyValue, ProgressBar, cx`.
- `#/components/cards.tsx` — `ProductCard, ShelfCard, ScrollRow, ProductSlot`.
- `#/components/layout.tsx` — nav/footer (already wired in `__root.tsx`).
- `#/components/dashboard.tsx` — `DashboardShell, DashHeader, Panel, Table, Td, BackLink` for Seller / Delivery partner.
- `#/components/media.tsx` — `RichEditor` (CKEditor, client-only), `MediaUploader`, `MapPanel`, `BarChart`, `Thumb`.

## Route rules
- Files in `src/routes/`, `createFileRoute('/path')`. Route tree is generated automatically by the Vite plugin (`src/routeTree.gen.ts`, do not edit).
- Public pages: fetch in `loader` with `publicGet` (SSR-safe). Add `validateSearch` for query params.
- Authenticated pages: fetch on the client inside `useEffect` with `api.*` (token lives in localStorage). Use the `useAuth()` `ready` flag; if `ready && !user`, render a sign-in prompt/redirect to `/signin` with `?next=`.
- Root layout already renders Main menu / Sub menu / Category bar / Footer / mobile bars for storefront pages, hides the category bar on `/cart`, `/checkout/*`, `/signin`, `/register`, and only shows the main menu for `/seller`. There are no admin, shelf-owner or rider pages here — the staff console is the separate `admin/front-end` app, the shelf-owner console / shelve application are the separate `shelves/front-end/web-app` app and the rider dashboard / delivery application are the separate `delivery/front-end/web-app` app.
- Mobile: every page must work at 390px. Sticky bottom action bars (`fixed inset-x-0 bottom-[66px] md:static`) for item / cart / checkout on mobile, as in frames M3–M7.
- Never use `window`/`localStorage` during render — only in effects/handlers.

## Money & rules to reflect in copy
20 % commission on shelf sales · escrow released on claim (ID + the buyer's shelf code) or the buyer's 4-digit rider code · 3 shelves per ward ·
boost (cash, no credits): UKOapp ad site KSh 500 per 1,000 views (unlimited viewers) · the two shop channels are bought by county and billed per county per day,
one rate countrywide: shop search & categories KSh 300 a day (2 days by default), home carousel KSh 1,000 a day (5 days by default), minimum 1 day, each channel expiring on its own day ·
pick three counties and the boost runs in, is charged for, and takes a slot in all three ·
slots a day per county: Nairobi 12 search / 3 carousel, Mombasa 8 / 2, Kisumu, Nakuru, Uasin Gishu 6 / 1, everywhere else 4 / 1 ·
home carousel boosts are shown to the county that bought them, falling back to Nairobi then Mombasa, and to no boosted slide at all when none is running ·
AI images: KSh 500 for 5 prompts · promo demo codes WATCH10 / UKO5 / SHELF20.
Codes: every order carries two unique codes known only to the buyer — `shelve_code` (shown at the shelf) and `rider_code`
(given to the rider). Every delivery carries `shelve_code` (shelf → rider hand-over) and `seller_code` (agent pickup from the seller).
Barter trade: bids of type item / item_cash / item_service / service / cash_service; cash is 0 unless a cash type is chosen;
trade at a shelve (inspected by the shelve owner, fee in KSh) or directly. Wallets: seller wallets withdraw to M-PESA (shelf wallets are in the shelves app),
rider wallets to M-PESA or card; minimum KSh 100. Packages: Pro KSh 600 / month, or KSh 400 / month billed annually (KSh 4,800 / year, no other discount) → email, SMS and
X / Facebook / Instagram posting pages (from the seller's or the UKO admin account). The staff console (shelves register, applications, riders, staff) is the separate `admin/front-end` app
(TanStack Router SPA on :3001) backed by `admin/back-end`. Every item can be barter-traded at a shelve. AI images come from the OpenAI Images API.
Database: MySQL `shop` (own database, no prefix); item price rows are the `variants` JSON list on the item (ids are stable per item).
