import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, EyeOff, PackageX, Plus, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { ProductPicker } from '#/components/product-picker'
import { CardHead, Img, Sheet, Toast } from '#/components/ui'
import type { ProductRow } from '#/lib/api/merchant'
import { savePicks } from '#/lib/api/picks'
import { tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'

/** Matches MAX_PICKS on the server and MIN_PICKS on the shop page (roadmap q-picks). */
const SLOTS = 4
const MIN_SHOWN = 2

/** The seller's picks as the products list has them: by rank. */
const picksOf = (products: ProductRow[]) =>
  products
    .filter((p) => p.pick_rank != null)
    .sort((a, b) => a.pick_rank! - b.pick_rank!)
    .map((p) => p.id)

/** A pick buyers can see: shown in the shop and not sold out. */
const showable = (p: ProductRow) => !!p.active && p.stock !== 0

/**
 * Top picks on Products (roadmap q-picks, decision n6): four slots, filled in order. An empty slot adds a product; a
 * filled one opens a sheet to move it, swap it or take it out. Every change saves at once.
 */
export function TopPicksCard({ products }: { products: ProductRow[] }) {
  const t = useT()
  const router = useRouter()
  const [picks, setPicks] = useState(() => picksOf(products))
  // The slot being changed: a pick's index in its sheet, or where the picker puts its product ('add' = the end).
  const [open, setOpen] = useState<number | null>(null)
  const [picking, setPicking] = useState<number | 'add' | null>(null)
  const [toast, setToast] = useState('')
  const byId = new Map(products.map((p) => [p.id, p]))
  const chosen = picks.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const seen = chosen.filter(showable).length

  function say(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  async function save(next: string[]) {
    const before = picks
    setPicks(next)
    setOpen(null)
    setPicking(null)
    try {
      const res = await savePicks({ data: { ids: next } })
      setPicks(res.ids)
      say(t('Top picks saved'))
      router.invalidate()
    } catch {
      setPicks(before)
      say(t('Not saved. Check your connection and try again.'))
    }
  }

  const move = (i: number, by: -1 | 1) => {
    const next = [...picks]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    save(next)
  }

  const note =
    chosen.length === 0
      ? t('Choose up to 4 products. Buyers see them first, above the rest of your shop.')
      : seen < MIN_SHOWN
        ? t('Buyers see Top picks once 2 of them are in stock and showing.')
        : seen < chosen.length
          ? t('Buyers see {n} of them. Sold-out and hidden ones stay out of sight.', { n: seen })
          : t('Buyers see these first, above the rest of your shop.')

  const current = open != null ? chosen[open] : undefined
  // The picker offers products buyers can see that are not picks already.
  const offer = products.filter((p) => p.active && !picks.includes(p.id))

  return (
    <section className="card mt-4 mb-4 p-4 md:mt-6 md:mb-6 md:flex md:items-center md:gap-8 md:p-5" aria-labelledby="top-picks-title">
      <div className="min-w-0 md:flex-1">
        <CardHead title={<span id="top-picks-title">{t('Top picks')}</span>} sub={note} />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-2 md:mt-0 md:w-[392px] md:shrink-0 md:gap-3">
        {Array.from({ length: SLOTS }, (_, i) => {
          const p = chosen[i]
          if (p) {
            const off = !showable(p)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  aria-label={`${t('Top pick {n}: {name}', { n: i + 1, name: p.name })}${off ? `, ${!p.active ? t('Hidden') : t('Sold out')}` : ''}`}
                  className="relative block aspect-[4/5] w-full overflow-hidden rounded-12 bg-well transition-transform active:scale-[0.97]"
                >
                  <Img size="thumb" k={p.images[0]} alt="" className={`h-full w-full ${off ? 'opacity-45' : ''}`} />
                  <span className="tnum absolute top-1.5 left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-card px-1.5 text-12 font-medium">
                    {i + 1}
                  </span>
                  {/* An icon, not a word: the slot is too narrow for "Sold out" or "Imefichwa"; the sheet says it in full. */}
                  {off && (
                    <span className="absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-card text-ink-2" aria-hidden="true">
                      {!p.active ? <EyeOff size={14} strokeWidth={1.75} /> : <PackageX size={14} strokeWidth={1.75} />}
                    </span>
                  )}
                </button>
              </li>
            )
          }
          const next = i === chosen.length
          return (
            <li key={`empty-${i}`}>
              <button
                type="button"
                onClick={() => setPicking('add')}
                aria-label={t('Add a top pick')}
                className="flex aspect-[4/5] w-full items-center justify-center rounded-12 border border-dashed border-line-strong text-faint transition-colors hover:border-ink hover:text-ink"
              >
                {next ? (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
                    <Plus size={16} strokeWidth={2.25} />
                  </span>
                ) : (
                  <Plus size={16} strokeWidth={1.75} />
                )}
              </button>
            </li>
          )
        })}
      </ol>

      <Sheet open={!!current} onClose={() => setOpen(null)} title={t('Top pick {n}', { n: (open ?? 0) + 1 })}>
        {current && open != null && (
          <>
            <div className="flex items-center gap-4">
              <Img size="thumb" k={current.images[0]} alt={current.name} className="h-20 w-16 shrink-0 rounded-12" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-15 leading-5 font-medium">{current.name}</p>
                <p className="tnum mt-0.5 text-14 text-ink-2">{tzs(current.price)}</p>
                {!showable(current) && (
                  <p className="mt-1 text-13 text-muted">
                    {!current.active ? t('Hidden from buyers, so it is out of Top picks too') : t('Sold out, so buyers don’t see it until it is back')}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ghost" disabled={open === 0} onClick={() => move(open, -1)}>
                <ArrowLeft size={16} strokeWidth={1.75} /> {t('Earlier')}
              </button>
              <button type="button" className="btn btn-ghost" disabled={open === chosen.length - 1} onClick={() => move(open, 1)}>
                {t('Later')} <ArrowRight size={16} strokeWidth={1.75} />
              </button>
            </div>
            <p className="hint mt-2">{t('Buyers see Top picks in this order, from the left.')}</p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                className="btn btn-quiet w-full"
                onClick={() => {
                  setPicking(open)
                  setOpen(null)
                }}
              >
                <RefreshCw size={16} strokeWidth={1.75} /> {t('Choose another product')}
              </button>
              <button type="button" className="btn btn-ghost w-full" onClick={() => save(picks.filter((id) => id !== current.id))}>
                <X size={16} strokeWidth={1.75} /> {t('Take out of Top picks')}
              </button>
            </div>
            <Link to="/app/products/$id" params={{ id: current.id }} className="mt-4 block text-center text-13 text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
              {t('Edit this product')}
            </Link>
          </>
        )}
      </Sheet>

      <ProductPicker
        open={picking != null}
        title={picking === 'add' ? t('Choose a top pick') : t('Choose another product')}
        products={offer}
        disableSoldOut
        onClose={() => setPicking(null)}
        onPick={(p) => save(picking === 'add' || picking == null ? [...picks, p.id] : picks.map((id, i) => (i === picking ? p.id : id)))}
      />

      <Toast show={!!toast}>
        <Check size={16} strokeWidth={2.25} /> {toast}
      </Toast>
    </section>
  )
}
