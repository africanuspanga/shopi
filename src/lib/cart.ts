import { useCallback, useEffect, useState } from 'react'

/** Lines are keyed by product and size, like "abc123" or "abc123|M". */
type Cart = Record<string, number>
const key = (shopId: string) => `rizk_cart_${shopId}`

export const lineKey = (productId: string, size?: string | null) => (size ? `${productId}|${size}` : productId)
export function parseLine(line: string) {
  const i = line.indexOf('|')
  return i < 0 ? { productId: line, size: null } : { productId: line.slice(0, i), size: line.slice(i + 1) }
}

function read(shopId: string): Cart {
  try {
    return JSON.parse(localStorage.getItem(key(shopId)) ?? '{}')
  } catch {
    return {}
  }
}

export function useCart(shopId: string) {
  const [cart, setCart] = useState<Cart>({})
  useEffect(() => {
    setCart(read(shopId))
    const onStorage = (e: StorageEvent) => e.key === key(shopId) && setCart(read(shopId))
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [shopId])

  const update = useCallback(
    (next: Cart) => {
      const clean = Object.fromEntries(Object.entries(next).filter(([, q]) => q > 0))
      setCart(clean)
      try {
        localStorage.setItem(key(shopId), JSON.stringify(clean))
      } catch {
        /* private mode: the cart still works for this visit */
      }
    },
    [shopId],
  )

  return {
    cart,
    count: Object.values(cart).reduce((s, q) => s + q, 0),
    lines: Object.entries(cart).map(([line, qty]) => ({ line, qty, ...parseLine(line) })),
    set: (line: string, qty: number) => update({ ...cart, [line]: qty }),
    add: (line: string, qty = 1) => update({ ...cart, [line]: (cart[line] ?? 0) + qty }),
    clear: () => update({}),
  }
}

/** Where the buyer came from: in-app browsers announce themselves in the user agent. */
export function trafficSource() {
  if (typeof window === 'undefined') return ''
  const param = new URLSearchParams(window.location.search).get('s')
  if (param) return param.slice(0, 20)
  const ua = navigator.userAgent
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return 'tiktok'
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook'
  if (/WhatsApp/i.test(ua) || /whatsapp/i.test(document.referrer)) return 'whatsapp'
  if (document.referrer) {
    try {
      return new URL(document.referrer).hostname.replace(/^www\./, '').slice(0, 20)
    } catch {
      return ''
    }
  }
  return 'direct'
}
