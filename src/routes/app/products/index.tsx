import { Link, createFileRoute } from '@tanstack/react-router'
import { Layers, Plus, Search, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Tag } from '#/components/shop'
import { ShareActions, prettyUrl } from '#/components/share'
import { Chips, Img, Page, Sheet, TopBar } from '#/components/ui'
import { listMyProducts, type ProductRow } from '#/lib/api/merchant'
import { track } from '#/lib/analytics'
import { tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'

export const Route = createFileRoute('/app/products/')({
  loader: () => listMyProducts(),
  component: Products,
})

type Filter = 'all' | 'live' | 'low' | 'out' | 'hidden'
const LOW = 3

function Products() {
  const t = useT()
  const products = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const origin = useOrigin()
  const [filter, setFilter] = useState<Filter>('all')
  const [sharing, setSharing] = useState<ProductRow | null>(null)
  const [q, setQ] = useState('')
  const out = (p: (typeof products)[number]) => p.stock === 0
  const low = (p: (typeof products)[number]) => p.stock != null && p.stock > 0 && p.stock <= LOW
  const live = products.filter((p) => p.active && !out(p)).length
  const needle = q.trim().toLowerCase()
  const shown = products.filter(
    (p) =>
      (filter === 'all' ? true : filter === 'live' ? p.active && !out(p) : filter === 'low' ? low(p) : filter === 'out' ? out(p) : !p.active) &&
      (!needle || p.name.toLowerCase().includes(needle)),
  )

  return (
    <Page nav wide>
      <TopBar
        title={t('Products')}
        sub={products.length ? t('{live} of {all} in your shop', { live, all: products.length }) : t('Nothing in your shop yet')}
        right={
          <>
            <label className="input hidden h-10 w-56 items-center gap-2 px-3 md:flex">
              <Search size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
              <input className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" placeholder={t('Search')} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Link to="/app/collections" className="btn btn-ghost btn-sm h-10">
              <Layers size={15} strokeWidth={1.75} /> {t('Collections')}
            </Link>
            <Link to="/app/products/new" className="btn btn-sm hidden h-10 md:inline-flex">
              <Plus size={16} strokeWidth={2} /> {t('Add product')}
            </Link>
          </>
        }
      />

      {products.length > 0 && (
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: t('All'), count: products.length },
            { id: 'live', label: t('In the shop'), count: live },
            ...(products.some(low) ? [{ id: 'low' as const, label: t('Running low'), count: products.filter(low).length }] : []),
            { id: 'out', label: t('Sold out'), count: products.filter(out).length },
            { id: 'hidden', label: t('Hidden'), count: products.filter((p) => !p.active).length },
          ]}
        />
      )}

      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
        <Link
          to="/app/products/new"
          className="group flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-line-strong text-center transition-colors hover:border-ink hover:bg-card"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white transition-transform group-active:scale-95">
            <Plus size={20} strokeWidth={2} />
          </span>
          <span className="px-4">
            <span className="block text-[14px] font-medium">{t('Add product')}</span>
            <span className="mt-0.5 block text-[13px] text-muted">{t('Photo, price, sizes')}</span>
          </span>
        </Link>
        {shown.map((p) => (
          <div key={p.id} className="group relative">
          <Link to="/app/products/$id" params={{ id: p.id }} className="block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[16px] bg-well">
              <Img sizes="(min-width: 1024px) 20vw, (min-width: 768px) 30vw, 50vw" k={p.images[0]} alt={p.name} className={`h-full w-full transition-opacity group-hover:opacity-90 ${!p.active || out(p) ? 'opacity-50' : ''}`} />
              <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                {!p.active ? <Tag>{t('Hidden')}</Tag> : out(p) ? <Tag>{t('Sold out')}</Tag> : low(p) ? <Tag hot>{t('{n} left', { n: p.stock! })}</Tag> : null}
              </div>
            </div>
            <p className="mt-3 line-clamp-2 px-0.5 text-[14px] leading-5 font-medium">{p.name}</p>
            <p className="tnum px-0.5 text-[14px] text-ink-2">{tzs(p.price)}</p>
            <p className="meta mt-1 px-0.5">
              {p.stock == null ? t('Not counted') : t('{n} left', { n: p.stock })} · {t('{n} views', { n: p.views >= 1000 ? `${(p.views / 1000).toFixed(1).replace(/\.0$/, '')}k` : p.views })}
            </p>
          </Link>
          {p.active && !out(p) && (
            <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/5]">
              <button
                type="button"
                aria-label={t('Share {name}', { name: p.name })}
                onClick={() => setSharing(p)}
                className="pointer-events-auto absolute top-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-card/95 shadow-[0_1px_2px_rgb(10_10_10/0.12)] backdrop-blur transition-colors hover:bg-ink hover:text-white"
              >
                <Share2 size={15} strokeWidth={1.75} />
              </button>
            </div>
          )}
          </div>
        ))}
      </div>
      {products.length > 0 && shown.length === 0 && <p className="mt-6 text-center text-[14px] text-muted">{t('No products match.')}</p>}

      <Sheet open={!!sharing} onClose={() => setSharing(null)} title={t('Send this product')}>
        {sharing && (
          <>
            <div className="flex items-center gap-4">
              <Img size="thumb" k={sharing.images[0]} alt={sharing.name} className="h-20 w-16 shrink-0 rounded-[10px]" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">{sharing.name}</p>
                <p className="tnum text-[14px] text-ink-2">{tzs(sharing.price)}</p>
                <p className="code mt-1 truncate text-[12px] text-muted">{prettyUrl(`${origin}/${shop.slug}/${sharing.slug ?? sharing.id}`)}</p>
              </div>
            </div>
            <p className="mt-5 text-[14px] leading-relaxed text-muted">{t('The buyer opens this one product, picks a size and orders. The link shows its photo and price in WhatsApp.')}</p>
            <div className="mt-5">
              <ShareActions
                url={`${origin}/${shop.slug}/${sharing.slug ?? sharing.id}`}
                title={sharing.name}
                text={t('Hi, here is {name} for {price}. You can order it here:', { name: sharing.name, price: tzs(sharing.price) })}
                onShared={(how) => track('seller_share', { shopId: shop.id, productId: sharing.id, detail: how })}
              />
            </div>
          </>
        )}
      </Sheet>
    </Page>
  )
}
