import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MapPin, Share2, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { BagButton, FactPills, MIN_PICKS, ProductGrid, ShopFacts, ShopFooter, ShopSearch, ShopTopBar, SocialLinks, TopPicks, matchesSearch, onSale, pickedProducts } from '#/components/shop'
import { ShopNav } from '#/components/shop-nav'
import { WhatsAppHelp, useWhatsApp } from '#/components/whatsapp'
import { Chips, Empty, Img, ShopAvatar, Toast, useEntrance } from '#/components/ui'
import { track } from '#/lib/analytics'
import { useCart } from '#/lib/cart'
import { waLink } from '#/lib/format'
import { shopAddress } from '#/lib/host'
import { useT } from '#/lib/i18n'
import { canonical, shopDescription, storeSchema } from '#/lib/seo'
import { shareLink, useOrigin } from '#/lib/share'
import { fontAttr, fontPreload } from '#/lib/theme'

export const Route = createFileRoute('/$shop/')({
  // Only what the head needs: the shop page's own address and the store's structured data.
  loader: async ({ parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    return { shop: loaderData!.shop, count: loaderData!.products.length }
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [storeSchema(loaderData.shop, shopDescription(loaderData.shop, loaderData.count))],
          links: [canonical(`/${loaderData.shop.slug}`), ...fontPreload(loaderData.shop.theme_font)],
        }
      : {},
  component: Storefront,
})
const parent = getRouteApi('/$shop')

const NEW_DAYS = 30
/** Shops this size or bigger get a search field on the page (phones also have Search in the capsule). */
const SEARCH_FROM = 6

function Storefront() {
  const rise = useEntrance()
  const rise2 = useEntrance('rise-2')
  const t = useT()
  const { shop, products, areas, collections, picks } = parent.useLoaderData()
  const cart = useCart(shop.id)
  // 'all', 'new', 'sale', or a collection's id.
  const [filter, setFilter] = useState('all')
  // What the buyer typed in the shop's search field: it searches the whole shop, whatever chip was on.
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(false)
  const url = shopAddress(useOrigin(), shop.slug)
  const cover = !!shop.cover_key
  const hello = t('Hi {shop}, I found your shop on Shopi.', { shop: shop.name })
  const chat = useWhatsApp(() => track('whatsapp_click', { shopId: shop.id, detail: 'shop' }))

  useEffect(() => {
    track('view_shop', { shopId: shop.id })
  }, [shop.id])

  const isNew = (p: (typeof products)[number]) => Date.now() - p.created_at < NEW_DAYS * 86400_000
  const counts = { new: products.filter(isNew).length, sale: products.filter(onSale).length }
  // The seller's collections come first in the chips, in their order, once they hold something to show.
  const groups = collections.filter((c) => c.productIds.length > 0)
  const group = groups.find((c) => c.id === filter)
  const searching = q.trim().length > 0
  const shown = searching
    ? products.filter((p) => matchesSearch(p, q))
    : group
      ? group.productIds.flatMap((id) => products.filter((p) => p.id === id))
      : filter === 'sale'
        ? products.filter(onSale)
        : filter === 'new'
          ? products.filter(isNew)
          : products
  const found = t(shown.length === 1 ? '{n} product' : '{n} products', { n: shown.length })
  // A search field once there is something to search through.
  const searchable = products.length >= SEARCH_FROM
  const search = (v: string) => {
    setQ(v)
    if (v.trim()) setFilter('all')
  }
  const showFilters = products.length > 0 && (groups.length > 0 || (counts.new > 0 && counts.new < products.length) || counts.sale > 0)
  // The seller's top picks that can be ordered now, above the chips once there are at least two.
  const topPicks = pickedProducts(picks, products)
  const showPicks = topPicks.length >= MIN_PICKS

  async function share() {
    const how = await shareLink(url, shop.name)
    if (how === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
    track('share', { shopId: shop.id, detail: how === 'copied' ? 'copy' : 'native' })
  }

  return (
    <div className="min-h-dvh bg-card pb-28 md:pb-0" data-font={fontAttr(shop.theme_font)}>
      <ShopTopBar
        shop={shop}
        bagCount={cart.count}
        right={
          <>
            <button type="button" className="icon-btn hidden sm:inline-flex" aria-label={t('Share shop')} onClick={share}>
              <Share2 size={17} strokeWidth={1.6} />
            </button>
            <span className="hidden md:block">
              <BagButton shopSlug={shop.slug} count={cart.count} />
            </span>
          </>
        }
      />

      <main className="mx-auto max-w-[1280px] px-4 md:px-10">
        {cover && (
          <div className="mt-2 aspect-[2/1] overflow-hidden rounded-[20px] bg-well md:mt-8 md:aspect-[16/5] md:rounded-[28px]">
            {/* Phones get the 600px copy: the cover is the first thing they paint, and data costs money. */}
            <Img k={shop.cover_key} alt="" priority sizes="(min-width: 768px) 1200px, 50vw" className="h-full w-full" />
          </div>
        )}
        <section
          className={`grid gap-8 pb-8 md:grid-cols-[minmax(0,1fr)_340px] md:gap-16 md:pb-14 lg:grid-cols-[minmax(0,1fr)_380px] ${cover ? 'pt-0 md:items-start' : 'pt-8 md:items-end md:pt-16'}`}
        >
          <div className={`${rise} min-w-0`}>
            <div className={`flex gap-4 md:block ${cover ? 'items-end' : 'items-center'}`}>
              <ShopAvatar
                name={shop.name}
                logo={shop.logo_key}
                className={`h-16 w-16 shrink-0 text-[20px] md:h-24 md:w-24 md:text-[28px] ${cover ? 'relative -mt-8 ml-3 ring-4 ring-card md:-mt-12 md:ml-8' : ''} max-md:hidden`}
              />
              <div className={`min-w-0 ${cover ? 'pb-1 md:mt-6 md:pb-0' : 'md:mt-8'}`}>
                <h1 className={`display text-[30px] break-words md:text-[60px] lg:text-[72px] max-md:hidden`}>{shop.name}</h1>
                {shop.location && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-muted md:mt-4 md:text-[15px]">
                    <MapPin size={15} strokeWidth={1.6} className="shrink-0" />
                    <span className="truncate">{shop.location}</span>
                  </p>
                )}
              </div>
            </div>
            {shop.bio && <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-ink-2 md:mt-6 md:text-[17px]">{shop.bio}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-2 md:mt-8">
              {shop.whatsapp && (
                <a
                  className="btn btn-sm h-10 px-4"
                  href={waLink(shop.whatsapp, hello)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={chat.onClick}
                >
                  <WhatsAppMark size={18} /> <span className="sm:hidden">WhatsApp</span>
                  <span className="hidden sm:inline">{t('Message on WhatsApp')}</span>
                </a>
              )}
              <button type="button" className="btn btn-ghost btn-sm h-10 px-4" onClick={share}>
                <Share2 size={15} strokeWidth={1.6} /> {t('Share')}
              </button>
              <SocialLinks shop={shop} whatsapp={false} />
            </div>
            {shop.whatsapp && <WhatsAppHelp show={chat.tapped} phone={shop.whatsapp} text={hello} />}
            <div className="mt-6 md:hidden">
              <FactPills shop={shop} areas={areas} />
            </div>
          </div>
          {/* Under a cover the logo overlaps its edge, so both columns start at the top and the card keeps clear of it. */}
          <aside className={`${rise2} hidden rounded-[20px] bg-page p-6 md:block ${cover ? 'md:mt-8' : ''}`}>
            <ShopFacts shop={shop} areas={areas} />
          </aside>
        </section>

        {showPicks && <TopPicks shop={shop} products={topPicks} cart={cart} />}

        <div className="border-t border-line pt-5 md:pt-6">
          {searchable && <ShopSearch value={q} onChange={search} shopName={shop.name} className="mb-4 md:hidden" />}
          {searching && showFilters && <p className="meta -mt-1 mb-3 md:hidden">{found}</p>}
          <div className="flex items-center justify-between gap-4">
            {showFilters ? (
              <Chips
                value={searching ? '' : filter}
                onChange={(f) => {
                  setFilter(f)
                  setQ('')
                }}
                options={[
                  { id: 'all', label: t('All'), count: products.length },
                  ...groups.map((c) => ({ id: c.id, label: c.name, count: c.productIds.length })),
                  ...(counts.new > 0 && counts.new < products.length ? [{ id: 'new', label: t('New in'), count: counts.new }] : []),
                  ...(counts.sale > 0 ? [{ id: 'sale', label: t('On sale'), count: counts.sale }] : []),
                ]}
              />
            ) : (
              <h2 className="title text-[18px]">{searching ? found : t('All products')}</h2>
            )}
            <div className="hidden shrink-0 items-center gap-4 md:flex">
              {products.length > 0 && <p className="meta">{found}</p>}
              {searchable && <ShopSearch value={q} onChange={search} shopName={shop.name} className="w-64 lg:w-72" />}
            </div>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="mt-6">
            <Empty
              icon={<Store size={20} strokeWidth={1.5} />}
              title={t('New products are on the way')}
              body={t('This shop is adding its first products. Message the seller on WhatsApp to ask what is in stock.')}
            />
          </div>
        ) : (
          <>
            {!searching && group?.description && <p className="fade pt-5 text-[15px] leading-relaxed text-ink-2 md:pt-6">{group.description}</p>}
            {searching && shown.length === 0 ? (
              <p className="mt-6 rounded-[20px] bg-page px-5 py-10 text-center text-[15px] leading-relaxed text-muted">
                {t('Nothing matches "{q}". Try another word, or ask the seller on WhatsApp.', { q: q.trim() })}
              </p>
            ) : (
              <ProductGrid shop={shop} products={shown} cart={cart} eager={showPicks ? 0 : 4} />
            )}
          </>
        )}
      </main>

      <ShopFooter shop={shop} />
      <ShopNav shop={shop} areas={areas} products={products} count={cart.count} onShare={share} />
      <Toast show={copied}>{t('Link copied')}</Toast>
    </div>
  )
}
