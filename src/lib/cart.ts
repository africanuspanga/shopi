import { useCallback, useEffect, useState } from 'react'

/** Lines are keyed by product and size, like "abc123" or "abc123|M". */
type Lines = Record<string, number>
const key = (shopId: string) => `shopi_cart_${shopId}`

export const lineKey = (productId: string, size?: string | null) => (size ? `${productId}|${size}` : productId)
export function parseLine(line: string) {
  const i = line.indexOf('|')
  return i < 0 ? { productId: line, size: null } : { productId: line.slice(0, i), size: line.slice(i + 1) }
}

function read(shopId: string): Lines {
  try {
    return JSON.parse(localStorage.getItem(key(shopId)) ?? '{}')
  } catch {
    return {}
  }
}

/** Told to every `useCart` of a shop in this tab when one of them changes the bag. */
const CART_EVENT = 'shopi:cart'

export type Cart = ReturnType<typeof useCart>

export function useCart(shopId: string) {
  const [cart, setCart] = useState<Lines>({})
  // The bag lives on the phone, so the server and the first render can't know it. False until it has been read.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setCart(read(shopId))
    setReady(true)
    const onStorage = (e: StorageEvent) => e.key === key(shopId) && setCart(read(shopId))
    // The same tab: the AI assistant's sheet puts a product in the bag while the page's own bag count is showing.
    const onSame = (e: Event) => (e as CustomEvent<string>).detail === shopId && setCart(read(shopId))
    window.addEventListener('storage', onStorage)
    window.addEventListener(CART_EVENT, onSame)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CART_EVENT, onSame)
    }
  }, [shopId])

  const update = useCallback(
    (next: Lines) => {
      const clean = Object.fromEntries(Object.entries(next).filter(([, q]) => q > 0))
      setCart(clean)
      try {
        localStorage.setItem(key(shopId), JSON.stringify(clean))
        window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: shopId }))
      } catch {
        /* private mode: the cart still works for this visit */
      }
    },
    [shopId],
  )

  return {
    cart,
    ready,
    count: Object.values(cart).reduce((s, q) => s + q, 0),
    lines: Object.entries(cart).map(([line, qty]) => ({ line, qty, ...parseLine(line) })),
    set: (line: string, qty: number) => update({ ...cart, [line]: qty }),
    add: (line: string, qty = 1) => update({ ...cart, [line]: (cart[line] ?? 0) + qty }),
    clear: () => update({}),
  }
}
