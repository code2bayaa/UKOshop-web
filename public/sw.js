/* UKOshop service worker: web push only (no offline caching).
 *
 * The API (shop/back-end/app/push.py) sends { title, body, url, tag } encrypted for this browser. We show it as a
 * system notification; tapping it focuses an open UKOshop tab on that page, or opens one. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'UKOshop'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/notifications', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const same = tabs.find((t) => new URL(t.url).origin === new URL(target).origin)
      if (same) return same.focus().then((t) => (t && 'navigate' in t ? t.navigate(target) : undefined))
      return self.clients.openWindow(target)
    }),
  )
})

// The browser rotated the subscription (expired keys): the page re-subscribes the next time Settings is opened.
self.addEventListener('pushsubscriptionchange', () => {})
