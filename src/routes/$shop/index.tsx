import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MapPin, Share2, Store } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { BagButton, FactPills, ProductGrid, ShopFacts, ShopFooter, ShopTopBar, SocialLinks, onSale } from '#/components/shop'
import { ShopNav } from '#/components/shop-nav'
import { Chips, Empty, LangSwitch, ShopAvatar, Toast } from '#/components/ui'
import { track } from '#/lib/analytics'
import { useCart } from '#/lib/cart'
import { waLink } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { canonical, shopDescription, storeSchema } from '#/lib/seo'
import { shareLink, useOrigin } from '#/lib/share'

export const Route = createFileRoute('/$shop/')({
  // Only what the head needs: the shop page's own address and the store's structured data.
  loader: async ({ parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    return { shop: loaderData!.shop, count: loaderData!.products.length }
  },
  head: ({ loaderData }) =>
    loaderData
      ? { meta: [storeSchema(loaderData.shop, shopDescription(loaderData.shop, loaderData.count))], links: [canonical(`/${loaderData.shop.slug}`)] }
      : {},
  component: Storefront,
})
const parent = getRouteApi('/$shop')

const NEW_DAYS = 30

function Storefront() {
  const t = useT()
  const { shop, products, areas, collections } = parent.useLoaderData()
  const cart = useCart(shop.id)
  // 'all', 'new', 'sale', or a collection's id.
  const [filter, setFilter] = useState('all')
  const [copied, setCopied] = useState(false)
  const url = `${useOrigin()}/${shop.slug}`

  // Phones: the top bar waits until the shop's name has scrolled out of view.
  const nameRef = useRef<HTMLDivElement>(null)
  const [pastName, setPastName] = useState(false)
  useEffect(() => {
    const el = nameRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPastName(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    track('view_shop', { shopId: shop.id })
  }, [shop.id])

  const isNew = (p: (typeof products)[number]) => Date.now() - p.created_at < NEW_DAYS * 86400_000
  const counts = { new: products.filter(isNew).length, sale: products.filter(onSale).length }
  // The seller's collections come first in the chips, in their order, once they hold something to show.
  const groups = collections.filter((c) => c.productIds.length > 0)
  const group = groups.find((c) => c.id === filter)
  const shown = group
    ? group.productIds.flatMap((id) => products.filter((p) => p.id === id))
    : filter === 'sale'
      ? products.filter(onSale)
      : filter === 'new'
        ? products.filter(isNew)
        : products
  const showFilters = products.length > 0 && (groups.length > 0 || (counts.new > 0 && counts.new < products.length) || counts.sale > 0)

  async function share() {
    const how = await shareLink(url, shop.name)
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
        reveal={pastName}
        right={
          <>
            <LangSwitch />
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
        <section className="grid gap-8 pt-8 pb-8 md:grid-cols-[minmax(0,1fr)_340px] md:items-end md:gap-16 md:pt-16 md:pb-14 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rise min-w-0">
            <div ref={nameRef} className="flex items-center gap-4 md:block">
              <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-16 w-16 text-[20px] md:h-24 md:w-24 md:text-[28px]" />
              <div className="min-w-0 md:mt-8">
                <h1 className="display text-[30px] break-words md:text-[60px] lg:text-[72px]">{shop.name}</h1>
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
                  href={waLink(shop.whatsapp, t('Hi {shop}, I found your shop on Shopi.', { shop: shop.name }))}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track('whatsapp_click', { shopId: shop.id, detail: 'shop' })}
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
            <div className="mt-6 md:hidden">
              <FactPills shop={shop} areas={areas} />
            </div>
          </div>
          <aside className="rise-2 hidden rounded-[20px] bg-page p-6 md:block">
            <ShopFacts shop={shop} areas={areas} />
          </aside>
        </section>

        <div className="flex items-center justify-between gap-4 border-t border-line pt-5 md:pt-6">
          {showFilters ? (
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: t('All'), count: products.length },
                ...groups.map((c) => ({ id: c.id, label: c.name, count: c.productIds.length })),
                ...(counts.new > 0 && counts.new < products.length ? [{ id: 'new', label: t('New in'), count: counts.new }] : []),
                ...(counts.sale > 0 ? [{ id: 'sale', label: t('On sale'), count: counts.sale }] : []),
              ]}
            />
          ) : (
            <h2 className="title text-[18px]">{t('All products')}</h2>
          )}
          {products.length > 0 && <p className="meta hidden shrink-0 md:block">{t(shown.length === 1 ? '{n} product' : '{n} products', { n: shown.length })}</p>}
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
            {group?.description && <p className="fade pt-5 text-[15px] leading-relaxed text-ink-2 md:pt-6">{group.description}</p>}
            <ProductGrid shop={shop} products={shown} cart={cart} />
          </>
        )}
      </main>

      <ShopFooter shop={shop} />
      <ShopNav shop={shop} areas={areas} products={products} count={cart.count} onShare={share} />
      <Toast show={copied}>{t('Link copied')}</Toast>
    </div>
  )
}
