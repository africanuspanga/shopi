import { useCallback, useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile: checks that a person, not a bot, is using a form, almost always without them doing anything.
 * The box shows only when Cloudflare wants a tap. The server checks the token (`src/server/turnstile.ts`).
 * Used on sign-up, checkout and "Notify me".
 */
export const SITE_KEY = '0x4AAAAAAGA6i1KgmOVokoYS'
/** Cloudflare's test key: always passes, on any address. Used everywhere but shopi.tz and shops' own domains (local work, tunnels). */
const TEST_KEY = '1x00000000000000000000AA'

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string | null | undefined
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let loading: Promise<Turnstile> | null = null

function load() {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * `slot` goes on an empty div just above the form's button: the box appears there when Cloudflare wants a tap. A screen
 * that draws its button twice (phone and desktop copies) may put `slot` on both; the visible one is used.
 *
 * `token()` gives the token for one request. It waits a few seconds if the check is still running, gives '' when the
 * check can't run on this phone (the server lets a few of those through), and gives `null` the first time the box is
 * waiting for a tap, so the form can ask for it. Tokens work once, so each call starts a fresh check for the next try.
 */
export function useHumanCheck(action: 'signup' | 'order' | 'alert' | 'book' | 'ask', active = true) {
  const slots = useRef(new Set<HTMLDivElement>())
  const state = useRef({ on: false, id: '', token: '', failed: false, tap: false, asked: false, waiting: [] as ((token: string) => void)[] })

  const slot = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    slots.current.add(el)
    return () => {
      slots.current.delete(el)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const st = state.current
    st.on = true
    const settle = (token: string) => {
      st.token = token
      st.failed = !token
      if (token) st.tap = false
      for (const resolve of st.waiting.splice(0)) resolve(token)
    }
    let gone = false
    load().then(
      (turnstile) => {
        const all = [...slots.current]
        const el = all.find((e) => e.getClientRects().length > 0) ?? all[0]
        if (gone || !el) return
        try {
          st.id =
            turnstile.render(el, {
              // The real key on shopi.tz and on a shop's own domain (which Shopi adds to the widget's hostnames).
              sitekey: location.hostname === 'shopi.tz' || (location.protocol === 'https:' && window.__SHOPI_SHOP__?.host === location.hostname) ? SITE_KEY : TEST_KEY,
              action,
              appearance: 'interaction-only',
              size: 'flexible',
              theme: 'light',
              callback: settle,
              'expired-callback': () => {
                st.token = ''
              },
              'before-interactive-callback': () => {
                st.tap = true
                for (const resolve of st.waiting.splice(0)) resolve('tap')
              },
              'error-callback': () => settle(''),
              'unsupported-callback': () => settle(''),
            }) ?? ''
        } catch {
          settle('')
        }
      },
      () => settle(''),
    )
    return () => {
      gone = true
      if (st.id) window.turnstile?.remove(st.id)
      Object.assign(st, { on: false, id: '', token: '', failed: false, tap: false, asked: false })
      for (const resolve of st.waiting.splice(0)) resolve('')
    }
  }, [action, active])

  const token = useCallback(async (): Promise<string | null> => {
    const st = state.current
    if (!st.on) return ''
    let token = st.token
    if (!token && !st.failed && !st.tap) {
      token = await new Promise<string>((resolve) => {
        st.waiting.push(resolve)
        setTimeout(() => resolve(''), 10_000)
      })
    }
    if (token === 'tap' || (!token && st.tap)) {
      // Ask once; if they press again without tapping, the server decides.
      if (!st.asked) {
        st.asked = true
        return null
      }
      token = ''
    }
    st.token = ''
    st.failed = false
    if (st.id) window.turnstile?.reset(st.id)
    return token
  }, [])

  return { slot, token }
}
