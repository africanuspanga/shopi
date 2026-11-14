import { Link, createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { Layers, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NotFound } from '#/components/not-found'
import { BagButton, ProductGrid, ShopFooter, ShopTopBar } from '#/components/shop'
import { ShopNav } from '#/components/shop-nav'
import { Empty, LangSwitch, Toast } from '#/components/ui'
import { track } from '#/lib/analytics'
import { useCart } from '#/lib/cart'
import { imgUrl } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { breadcrumbSchema, canonical, collectionDescription, collectionTitle } from '#/lib/seo'
import { shareLink, useOrigin } from '#/lib/share'

/** A collection the seller made, at its own link: shopi.tz/<shop>/c/<slug>. */
export const Route = createFileRoute('/$shop/c/$slug')({
  loader: async ({ params, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    const collection = loaderData?.collections.find((c) => c.slug === params.slug.toLowerCase())
    if (!loaderData || !collection) throw notFound()
    const first = collection.productIds.map((id) => loaderData.products.find((p) => p.id === id)).find((p) => p?.images[0])
    return { collection, shop: loaderData.shop, origin: loaderData.origin, cover: first?.images[0] ?? null }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] }
    const { collection: c, shop, origin, cover } = loaderData
    const title = collectionTitle(c, shop)
    const description = collectionDescription(c, shop)
    const path = `/${shop.slug}/c/${c.slug}`
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: `${c.name} · ${shop.name}` },
        { property: 'og:description', content: description },
        { property: 'og:url', content: `${origin}${path}` },
        { name: 'twitter:card', content: 'summary_large_image' },
        ...(cover ? [{ property: 'og:image', content: `${origin}${imgUrl(cover)}` }] : []),
        breadcrumbSchema([
          [shop.name, `/${shop.slug}`],
          [c.name, path],
        ]),
      ],
      links: [canonical(path)],
    }
  },
  notFoundComponent: CollectionNotFound,
  component: CollectionPage,
})
const parent = getRouteApi('/$shop')

function CollectionNotFound() {
  const { shop } = Route.useParams()
  return <NotFound title="This collection is not here" body="The seller may have taken it down. Their shop has everything else." href={`/${shop}`} action="See the shop" />
}

function CollectionPage() {
  const t = useT()
  const { shop, products, areas, collections } = parent.useLoaderData()
  const { collection: c } = Route.useLoaderData()
  const cart = useCart(shop.id)
  const [copied, setCopied] = useState(false)
  const url = `${useOrigin()}/${shop.slug}/c/${c.slug}`
  const items = c.productIds.flatMap((id) => products.filter((p) => p.id === id))
  const others = collections.filter((x) => x.productIds.length > 0 || x.id === c.id)

  useEffect(() => {
    // A collection page is a visit to the shop.
    track('view_shop', { shopId: shop.id, detail: 'collection' })
  }, [shop.id, c.id])

  async function share() {
    const how = await shareLink(url, `${c.name} · ${shop.name}`)
    if (how === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
    track('share', { shopId: shop.id, detail: how === 'copied' ? 'copy' : 'native' })
  }

  return (
    <div className="min-h-dvh bg-card pb-28 md:pb-0">
      <ShopTopBar
        shop={shop}
        right={
          <>
            <LangSwitch />
            <button type="button" className="icon-btn hidden sm:inline-flex" aria-label={t('Share collection')} onClick={share}>
              <Share2 size={17} strokeWidth={1.6} />
            </button>
            <span className="hidden md:block">
              <BagButton shopSlug={shop.slug} count={cart.count} />
            </span>
          </>
        }
      />

      <main className="mx-auto max-w-[1280px] px-4 md:px-10">
        <section className="rise pt-8 pb-7 md:pt-16 md:pb-12">
          <Link to="/$shop" params={{ shop: shop.slug }} className="text-[14px] text-muted transition-colors hover:text-ink md:text-[15px]">
            {shop.name}
          </Link>
          <h1 className="display mt-2 text-[36px] break-words md:mt-3 md:text-[64px] lg:text-[76px]">{c.name}</h1>
          {c.description && <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-ink-2 md:mt-5 md:text-[17px]">{c.description}</p>}
          <div className="mt-5 flex items-center gap-3 md:mt-8">
            <button type="button" className="btn btn-ghost btn-sm h-10 px-4" onClick={share}>
              <Share2 size={15} strokeWidth={1.6} /> {t('Share')}
            </button>
            <p className="meta">{t(items.length === 1 ? '{n} product' : '{n} products', { n: items.length })}</p>
          </div>
        </section>

        <nav aria-label={t('Collections')} className="hide-scroll -mx-4 flex gap-2 overflow-x-auto border-t border-line px-4 pt-5 md:mx-0 md:px-0 md:pt-6">
          <Link to="/$shop" params={{ shop: shop.slug }} className="chip">
            {t('All products')}
          </Link>
          {others.map((x) => (
            <Link key={x.id} to="/$shop/c/$slug" params={{ shop: shop.slug, slug: x.slug }} className="chip" data-active={x.id === c.id} aria-current={x.id === c.id ? 'page' : undefined}>
              {x.name}
            </Link>
          ))}
        </nav>

        {items.length ? (
          <ProductGrid shop={shop} products={items} cart={cart} />
        ) : (
          <div className="mt-6">
            <Empty
              icon={<Layers size={20} strokeWidth={1.5} />}
              title={t('Nothing in this collection right now')}
              body={t('The seller is restocking it. Everything else is in the shop.')}
              action={
                <Link to="/$shop" params={{ shop: shop.slug }} className="btn">
                  {t('See {shop}', { shop: shop.name })}
                </Link>
              }
            />
          </div>
        )}
      </main>

      <ShopFooter shop={shop} />
      <ShopNav shop={shop} areas={areas} products={products} count={cart.count} onShare={share} away />
      <Toast show={copied}>{t('Link copied')}</Toast>
    </div>
  )
}
