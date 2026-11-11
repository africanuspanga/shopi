import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Check, MapPin, Share2, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { BagButton, FactPills, ProductCard, QuickAddSheet, ShopFacts, ShopFooter, ShopTopBar, SocialLinks, onSale } from '#/components/shop'
import { ShopNav } from '#/components/shop-nav'
import { Chips, Empty, LangSwitch, ShopAvatar, Toast } from '#/components/ui'
import type { PublicProduct } from '#/lib/api/store'
import { track } from '#/lib/analytics'
import { lineKey, useCart } from '#/lib/cart'
import { waLink } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { shareLink, useOrigin } from '#/lib/share'

export const Route = createFileRoute('/$shop/')({ component: Storefront })
const parent = getRouteApi('/$shop')

const NEW_DAYS = 30

function Storefront() {
  const t = useT()
  const { shop, products, areas } = parent.useLoaderData()
  const cart = useCart(shop.id)
  const [filter, setFilter] = useState<'all' | 'new' | 'sale'>('all')
  const [copied, setCopied] = useState(false)
  const [quick, setQuick] = useState<PublicProduct | null>(null)
  const [added, setAdded] = useState('')
  const url = `${useOrigin()}/${shop.slug}`

  useEffect(() => {
    track('view_shop', { shopId: shop.id })
  }, [shop.id])

  const isNew = (p: (typeof products)[number]) => Date.now() - p.created_at < NEW_DAYS * 86400_000
  const counts = { new: products.filter(isNew).length, sale: products.filter(onSale).length }
  const shown = filter === 'sale' ? products.filter(onSale) : filter === 'new' ? products.filter(isNew) : products
  const showFilters = products.length > 0 && ((counts.new > 0 && counts.new < products.length) || counts.sale > 0)

  function addToBag(p: PublicProduct, size: string | null) {
    cart.add(lineKey(p.id, size))
    track('add_to_cart', { shopId: shop.id, productId: p.id, detail: 'quick' })
    setQuick(null)
    setAdded(size ? t('{name}, size {size}, is in your bag', { name: p.name, size }) : t('{name} is in your bag', { name: p.name }))
    setTimeout(() => setAdded(''), 2200)
  }

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
        <section className="grid gap-8 pt-6 pb-8 md:grid-cols-[minmax(0,1fr)_340px] md:items-end md:gap-16 md:pt-16 md:pb-14 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rise min-w-0">
            <div className="flex items-center gap-4 md:block">
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
                ...(counts.new > 0 && counts.new < products.length ? [{ id: 'new' as const, label: t('New in'), count: counts.new }] : []),
                ...(counts.sale > 0 ? [{ id: 'sale' as const, label: t('On sale'), count: counts.sale }] : []),
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 pt-5 md:grid-cols-3 md:gap-x-6 md:gap-y-12 md:pt-8 lg:grid-cols-4">
            {shown.map((p, i) => (
              <ProductCard key={p.id} shopSlug={shop.slug} p={p} eager={i < 4} onQuickAdd={(x) => (x.sizes ? setQuick(x) : addToBag(x, null))} />
            ))}
          </div>
        )}
      </main>

      <ShopFooter shop={shop} />
      <ShopNav shop={shop} areas={areas} products={products} count={cart.count} onShare={share} />
      <QuickAddSheet key={quick?.id ?? 'none'} shopSlug={shop.slug} p={quick} onClose={() => setQuick(null)} onAdd={(size) => quick && addToBag(quick, size)} />
      <Toast show={copied}>{t('Link copied')}</Toast>
      <Toast show={!!added}>
        <Check size={16} strokeWidth={2.25} /> {added}
      </Toast>
    </div>
  )
}
