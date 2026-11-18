import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Layers, PenLine, Plus, Share2 } from 'lucide-react'
import { useState } from 'react'
import { CollectionCover } from '#/components/collections'
import { ShareActions, prettyUrl } from '#/components/share'
import { Empty, Page, Sheet, TopBar } from '#/components/ui'
import { listCollections, orderCollections, type CollectionRow } from '#/lib/api/collections'
import { track } from '#/lib/analytics'
import { useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'

export const Route = createFileRoute('/app/collections/')({
  loader: () => listCollections(),
  head: () => ({ meta: [{ title: 'Collections · Shopi' }] }),
  component: Collections,
})

function Collections() {
  const t = useT()
  const router = useRouter()
  const loaded = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const origin = useOrigin()
  // The order moves at once on screen and is saved behind it.
  const [order, setOrder] = useState<string[] | null>(null)
  const list = order ? order.flatMap((id) => loaded.filter((c) => c.id === id)) : loaded
  const [sharing, setSharing] = useState<CollectionRow | null>(null)
  const urlOf = (c: CollectionRow) => `${origin}/${shop.slug}/c/${c.slug}`

  async function move(i: number, by: -1 | 1) {
    const ids = list.map((c) => c.id)
    ;[ids[i], ids[i + by]] = [ids[i + by], ids[i]]
    setOrder(ids)
    await orderCollections({ data: { ids } })
    await router.invalidate()
    setOrder(null)
  }

  return (
    <Page nav wide>
      <TopBar
        back="/app/products"
        title={t('Collections')}
        sub={t('Groups of products, each with its own link')}
        right={
          <Link to="/app/collections/new" className="btn btn-sm">
            <Plus size={16} strokeWidth={2.25} /> {t('New collection')}
          </Link>
        }
      />

      {list.length === 0 ? (
        <Empty
          icon={<Layers size={20} strokeWidth={1.75} />}
          title={t('No collections yet')}
          body={t('Group products for a season or a price, like Eid or Under 30k. Each collection gets its own link to share.')}
          action={
            <Link to="/app/collections/new" className="btn btn-sm">
              <Plus size={16} strokeWidth={2.25} /> {t('New collection')}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {list.map((c, i) => (
            <section key={c.id} className="card flex gap-4 p-4 md:p-5">
              <Link to="/app/collections/$id" params={{ id: c.id }} className="shrink-0" aria-label={t('Edit {name}', { name: c.name })}>
                <CollectionCover images={c.images} className="h-[104px] w-[104px] md:h-[120px] md:w-[120px]" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to="/app/collections/$id" params={{ id: c.id }} className="block truncate text-15 font-semibold hover:underline hover:decoration-line-strong hover:underline-offset-4">
                      {c.name}
                    </Link>
                    <p className="text-13 text-muted">{t(c.productIds.length === 1 ? '{n} product' : '{n} products', { n: c.productIds.length })}</p>
                  </div>
                  {list.length > 1 && (
                    <span className="-mt-1 -mr-1 flex shrink-0">
                      <button type="button" aria-label={t('Move up')} title={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-well disabled:text-faint disabled:hover:bg-transparent">
                        <ArrowUp size={16} strokeWidth={1.75} />
                      </button>
                      <button type="button" aria-label={t('Move down')} title={t('Move down')} disabled={i === list.length - 1} onClick={() => move(i, 1)} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-well disabled:text-faint disabled:hover:bg-transparent">
                        <ArrowDown size={16} strokeWidth={1.75} />
                      </button>
                    </span>
                  )}
                </div>
                <p className="code mt-1 truncate text-12 text-muted">{prettyUrl(urlOf(c))}</p>
                <div className="mt-auto flex gap-2 pt-3">
                  <button type="button" className="btn btn-quiet btn-sm flex-1" onClick={() => setSharing(c)} disabled={!c.productIds.length}>
                    <Share2 size={16} strokeWidth={1.75} /> {t('Share')}
                  </button>
                  <Link to="/app/collections/$id" params={{ id: c.id }} className="btn btn-ghost btn-sm flex-1">
                    <PenLine size={16} strokeWidth={1.75} /> {t('Edit')}
                  </Link>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      {list.length > 1 && <p className="mt-4 text-13 text-muted">{t('Your shop shows collections in this order.')}</p>}

      <Sheet open={!!sharing} onClose={() => setSharing(null)} title={t('Share this collection')}>
        {sharing && (
          <>
            <div className="flex items-center gap-4">
              <CollectionCover images={sharing.images} className="h-20 w-20" />
              <div className="min-w-0">
                <p className="truncate text-15 font-semibold">{sharing.name}</p>
                <p className="text-13 text-muted">{t(sharing.productIds.length === 1 ? '{n} product' : '{n} products', { n: sharing.productIds.length })}</p>
                <p className="code mt-1 truncate text-12 text-muted">{prettyUrl(urlOf(sharing))}</p>
              </div>
            </div>
            <p className="mt-5 text-14 leading-relaxed text-muted">{t('The link opens on these products only. WhatsApp shows the first photo.')}</p>
            <div className="mt-5">
              <ShareActions
                url={urlOf(sharing)}
                title={sharing.name}
                text={t('{name} at {shop}:', { name: sharing.name, shop: shop.name })}
                onShared={(how) => track('seller_share', { shopId: shop.id, detail: `collection-${how}` })}
              />
            </div>
          </>
        )}
      </Sheet>
    </Page>
  )
}
