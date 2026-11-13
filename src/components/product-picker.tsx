import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Img, Sheet } from '#/components/ui'
import type { ProductRow } from '#/lib/api/merchant'
import { tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'

/** Search the seller's products and pick one. With `disableSoldOut`, sold-out products can't be picked. */
export function ProductPicker({
  open,
  title,
  products,
  onClose,
  onPick,
  disableSoldOut = false,
}: {
  open: boolean
  title: string
  products: ProductRow[]
  onClose: () => void
  onPick: (p: ProductRow) => void
  disableSoldOut?: boolean
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? products.filter((p) => p.name.toLowerCase().includes(n)) : products
  }, [q, products])
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <label className="input flex items-center gap-2 px-3">
        <Search size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
        <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t('Search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul className="mt-3 divide-y divide-line">
        {shown.map((p) => {
          const off = disableSoldOut && p.stock === 0
          return (
            <li key={p.id}>
              <button type="button" disabled={off} className="flex w-full items-center gap-3 py-3 text-left disabled:opacity-45" onClick={() => onPick(p)}>
                <Img size="thumb" k={p.images[0]} alt={p.name} className="h-12 w-10 shrink-0 rounded-[8px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{p.name}</span>
                  <span className="block text-[13px] text-muted">
                    {p.stock == null ? t('In stock') : p.stock === 0 ? t('Sold out') : t('{n} in stock', { n: p.stock })}
                    {!p.active && ` · ${t('Hidden')}`}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[14px]">{tzs(p.price)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {shown.length === 0 && <p className="py-6 text-center text-[14px] text-muted">{t('No products match.')}</p>}
    </Sheet>
  )
}
