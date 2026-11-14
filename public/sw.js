// Shopi's service worker, registered by the seller app (src/lib/push.ts). It shows the notifications src/server/push.ts
// sends (new orders, payments to check) and opens the order when one is tapped. It does not cache or touch requests.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let note = {}
  try {
    note = event.data ? event.data.json() : {}
  } catch {
    note = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(note.title || 'Shopi', {
        body: note.body || '',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        // The same order's notifications replace each other, and the newest still rings.
        tag: note.tag,
        renotify: Boolean(note.tag),
        data: { url: note.url || '/app' },
      })
      // An open seller app refreshes its lists.
      for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'shopi-push' })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/app', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).pathname.startsWith('/app')) || windows[0]
      if (open) {
        await open.focus()
        try {
          await open.navigate(url)
          return
        } catch {
          // A window this worker doesn't control can't be sent somewhere; open the order instead.
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
