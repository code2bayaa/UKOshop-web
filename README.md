# UKO shop — front-end

Responsive web app for the UKO shop (TanStack Start · React 19 · Tailwind v4 · GSAP · CKEditor 5 · lucide icons).
Design source: `../../docs/wireframe.pen` (17 desktop screens at 1440px, 8 mobile screens at 390px, shared component kit).

```powershell
npm install
npm run dev        # http://localhost:3000  (expects the API at VITE_API_URL, default http://localhost:8000)
npm run build
```

See `FRONTEND-GUIDE.md` for the conventions, tokens and the shared component kit.

`VITE_SHELVES_URL` (default http://localhost:3012) points at the standalone shelves app, which now hosts "apply for a shelve" (`/`)
and the shelf-owner console (`/dashboard`).

`VITE_DELIVERY_URL` (default http://localhost:3014) points at the standalone delivery app, which now hosts "apply for delivery" (`/`),
rider sign-in (`/login`) and the rider dashboard (`/dashboard`).

## Routes

| Path | Screen |
|---|---|
| `/` | 01 Home — hero, GSAP carousel, value strip, scroll rows, shelves, CTA banner |
| `/items` | 02 Category / more items — filter rail, sort, scroll pagination with `#page-N` anchors + fixed page rail, mobile filter sheet |
| `/items/$id` | 03 Item detail — gallery, type → colour → size sets the amount, add to cart / buy now, direct-from-seller notice, **barter trade bids** (item / item + cash / item + service / service / cash + service, trade directly or at a shelve, policy), tabs, reviews, more from seller |
| `/cart` → `/checkout/shelve` → `/checkout/payment` → `/checkout/done` | 04–06 Cart, shelf & delivery, payment (M-PESA, escrow), confirmation |
| `/signin`, `/register` | 07 |
| `/post-ad` (`?edit=id`) | 08 Post ad — CKEditor, variants, category/sub/catalogue (+add), shelve request + hand-off code, AI images, boost, **barter trade form** (which offers the seller accepts) |
| `/seller` (`?tab=`) | 09 Seller items page — ads, feedback, analytics, boost, **orders (accepted / cancelled / returned, trade type, shelve or not, load-more + fixed page numbers)**, **barter bids**, **wallet with M-PESA withdrawal**, **packages (monthly / annual)** and, with a package, **email / SMS / X / Facebook / Instagram messaging pages** |
| `/orders`, `/orders/$id/track` | 10 Buyer orders (unpaid · shipped · completed · cancelled · returned · sold by seller directly · sold from shelve) with the buyer's **shelf code** and **rider code**, 16 Delivery tracking |
| — | 11 Shelve owner console — moved to the shelves app (`shelves/front-end/web-app`, `${VITE_SHELVES_URL}/dashboard`, default http://localhost:3012/dashboard); menus, account page and notifications link there |
| `/admin/login`, `/admin/shelves` | 12–13 Admin — **staff ID** sign-in, shelves register + remove prompt, shelve application confirmation, **delivery partners (rider details + remove prompt)**, **driver application confirmation**, staff accounts |
| — | 14 Apply for a shelve moved to the shelves app (`${VITE_SHELVES_URL}/`) · 15 Delivery application moved to the delivery app (`delivery/front-end/web-app`, `${VITE_DELIVERY_URL}/`) |
| — | 17 Delivery partner — moved to the delivery app (`${VITE_DELIVERY_URL}/dashboard`, default http://localhost:3014/dashboard); menus and the account page link there |
| `/mpesa-test` | M-PESA STK push test harness (signed in) — push → joins the sockets room `MerchantRequestID` on `VITE_SOCKETS_URL` → Daraja callback relayed as `callback` → `POST /api/payments/mpesa/confirm` validates it → row in `credit_payments` approved; "Simulate Daraja callback" button when the API has no Daraja keys |
| `/shelves`, `/shelves/$id`, `/notifications`, `/chat`, `/chat/$userId`, `/about`, `/contact`, `/blog`, `/help`, `/account` | supporting pages |

Global chrome (`src/routes/__root.tsx`): Main menu (100% width, primary), Sub menu (logo · search + prompt insert · help),
Category bar (50px, icons, ellipsis, "All categories" GSAP slide-down that pushes the body), Footer (newsletter · about · blogs · how to · contact · report complaint),
Mobile top bar + bottom tabs.
