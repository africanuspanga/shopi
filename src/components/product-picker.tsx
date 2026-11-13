import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Img, Sheet } from '#/components/ui'
import type { ProductRow } from '#/lib/api/merchant'
import { tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'

/**
 * Search the seller's products and pick one. With `disableSoldOut`, sold-out products can't be picked.
 * With `picked`, it picks several: each tap adds or removes one (the page keeps the list), and Done closes it.
 */
export function ProductPicker({
  open,
  title,
  products,
  onClose,
  onPick,
  disableSoldOut = false,
  picked,
}: {
  open: boolean
  title: string
  products: ProductRow[]
  onClose: () => void
  onPick: (p: ProductRow) => void
  disableSoldOut?: boolean
  picked?: Set<string>
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
              <button
                type="button"
                disabled={off}
                aria-pressed={picked ? picked.has(p.id) : undefined}
                className="flex w-full items-center gap-3 py-3 text-left disabled:opacity-45"
                onClick={() => onPick(p)}
              >
                {picked && (
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${picked.has(p.id) ? 'bg-ink text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]'}`}
                  >
                    {picked.has(p.id) && <Check size={12} strokeWidth={3} />}
                  </span>
                )}
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
      {picked && (
        <div className="sticky bottom-0 -mx-5 mt-2 bg-gradient-to-t from-card from-70% to-transparent px-5 pt-6 md:-mx-6 md:px-6">
          <button type="button" className="btn btn-lg w-full" onClick={onClose}>
            {t('Done, {n} chosen', { n: picked.size })}
          </button>
        </div>
      )}
    </Sheet>
  )
}
