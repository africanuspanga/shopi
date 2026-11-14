import { useCallback, useEffect, useState } from 'react'
import { getPushKey, removePushSubscription, savePushSubscription, testPush } from '#/lib/api/push'

/**
 * The seller's phone: installing Shopi as an app, and notifications for new orders (sent by `src/server/push.ts`,
 * shown by `public/sw.js`). The worker is registered only in the seller app, never on buyers' pages.
 *
 * States: `unsupported` (this browser can't), `ios` (an iPhone browser tab: Apple allows notifications only once Shopi
 * is on the Home Screen), `blocked` (the seller said no; only site settings can undo it), `off`, `on`.
 */
export type AlertState = 'loading' | 'unsupported' | 'ios' | 'blocked' | 'off' | 'on'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let installPrompt: InstallPrompt | null = null
const installListeners = new Set<() => void>()

/** Chrome offers to install once; keep the offer so a button can use it later. Called once by the seller app. */
export function catchInstallPrompt() {
  const onPrompt = (e: Event) => {
    e.preventDefault()
    installPrompt = e as InstallPrompt
    installListeners.forEach((f) => f())
  }
  const onInstalled = () => {
    installPrompt = null
    installListeners.forEach((f) => f())
  }
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

export const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registration() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  return navigator.serviceWorker.ready
}

export function usePhoneApp() {
  const [state, setState] = useState<AlertState>('loading')
  const [canInstall, setCanInstall] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setInstalled(isInstalled())
    const sync = () => setCanInstall(!!installPrompt && !isInstalled())
    sync()
    installListeners.add(sync)
    let gone = false
    ;(async () => {
      if (!canPush()) return setState(isIos() && !isInstalled() ? 'ios' : 'unsupported')
      if (Notification.permission === 'denied') return setState('blocked')
      const reg = await registration()
      const sub = await reg.pushManager.getSubscription()
      if (gone) return
      // Already on: tell the server again, so a renewed address or a new login on this phone still gets them.
      if (sub && Notification.permission === 'granted') {
        setState('on')
        savePushSubscription({ data: sub.toJSON() as never }).catch(() => {})
      } else setState('off')
    })().catch(() => !gone && setState('unsupported'))
    return () => {
      gone = true
      installListeners.delete(sync)
    }
  }, [])

  const install = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    installPrompt = null
    setCanInstall(false)
    setInstalled(isInstalled())
  }, [])

  /** Asks the phone, then subscribes. Returns why it didn't work, if it didn't. */
  const turnOn = useCallback(async (): Promise<'ok' | 'blocked' | 'error'> => {
    setBusy(true)
    try {
      const key = await getPushKey()
      if (!key) return 'error'
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return 'blocked'
      }
      const reg = await registration()
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
      const res = await savePushSubscription({ data: sub.toJSON() as never })
      if ('error' in res) return 'error'
      setState('on')
      return 'ok'
    } catch {
      return 'error'
    } finally {
      setBusy(false)
    }
  }, [])

  const turnOff = useCallback(async () => {
    setBusy(true)
    try {
      const sub = await (await registration()).pushManager.getSubscription()
      if (sub) {
        await removePushSubscription({ data: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }, [])

  const test = useCallback(async () => {
    setBusy(true)
    try {
      const sub = await (await registration()).pushManager.getSubscription()
      if (!sub) return false
      const res = await testPush({ data: { endpoint: sub.endpoint } })
      return 'ok' in res
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, busy, canInstall, installed, ios: state === 'ios', install, turnOn, turnOff, test }
}
