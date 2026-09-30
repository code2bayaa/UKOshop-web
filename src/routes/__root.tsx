import { HeadContent, Outlet, Scripts, createRootRoute, useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { publicGet, type Category } from '#/lib/api'
import { AuthProvider } from '#/lib/auth'
import { CartProvider } from '#/lib/cart'
import { MessagesProvider } from '#/lib/messages'
import { NotificationsProvider } from '#/lib/notifications'
import { ToastProvider } from '#/lib/toast'
import { CategoryBar, Footer, MainMenu, MobileBottomTabs, MobileTopBar, SubMenu } from '#/components/layout'
import { TermsGate } from '#/components/terms-gate'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'UKO shop — Buy without the risk' },
      { name: 'description', content: 'Drop your item at a shel. UKO verifies it, markets it and delivers it to the buyer.' },
      { name: 'theme-color', content: '#1B2A6B' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  loader: async () => {
    let categories: Category[] = []
    try {
      categories = await publicGet<Category[]>('/categories')
    } catch {
      categories = []
    }
    return { categories }
  },
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootError,
})

function RootError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const offline = /fetch failed|Failed to load|NetworkError/i.test(message)
  return (
    <div className="container-x flex flex-col items-center gap-3 py-24 text-center">
      <span className="rounded-full bg-danger-050 px-3 py-1 text-xs font-semibold text-danger">{offline ? 'API offline' : 'Something went wrong'}</span>
      <h1 className="text-2xl">{offline ? 'The shop API is not reachable' : 'We could not load this page'}</h1>
      <p className="m-0 max-w-md text-sm text-ink-2">{offline ? 'Start the back-end (back-end/run.ps1 → http://localhost:8000) and reload.' : message}</p>
      <a href="/" className="mt-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600">Reload</a>
    </div>
  )
}

function NotFound() {
  return (
    <div className="container-x flex flex-col items-center gap-3 py-24 text-center">
      <span className="rounded-full bg-primary-050 px-3 py-1 text-xs font-semibold text-primary">404</span>
      <h1 className="text-2xl">That page is not on any shelf</h1>
      <p className="m-0 max-w-sm text-sm text-ink-2">The link may be old or the item was removed. Browse verified items near you instead.</p>
      <a href="/items" className="mt-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600">Browse items</a>
    </div>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

const DASHBOARD_PREFIXES = ['/seller']
const CHECKOUT_PREFIXES = ['/cart', '/checkout']

function RootLayout() {
  const { categories } = Route.useLoaderData()
  const { pathname } = useLocation()
  const isDashboard = DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p))
  const isCheckout = CHECKOUT_PREFIXES.some((p) => pathname.startsWith(p))
  const isAuth = pathname === '/signin' || pathname === '/register'
  const storefront = !isDashboard
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <NotificationsProvider>
            <MessagesProvider>
              <div id="app" className="flex min-h-screen flex-col">
                <MainMenu />
                {storefront && <MobileTopBar categories={categories} />}
                {storefront && <SubMenu />}
                {storefront && !isCheckout && !isAuth && <CategoryBar categories={categories} />}
                <div className="flex-1">
                  <Outlet />
                </div>
                {storefront && <Footer />}
                {storefront && <MobileBottomTabs />}
              </div>
              <TermsGate />
            </MessagesProvider>
          </NotificationsProvider>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
