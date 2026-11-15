import { Link, createFileRoute, getRouteApi, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Bell, Check, Minus, Plus, Share2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { ShareActions } from '#/components/share'
import { BagButton, OptionChip, Price, ProductCard, ShopFooter, ShopTopBar, Tag, shownPrice } from '#/components/shop'
import { NotFound } from '#/components/not-found'
import { NotifySheet, useAsked } from '#/components/stock-alerts'
import { Img, Toast, useEntrance } from '#/components/ui'
import { track } from '#/lib/analytics'
import { lineKey, useCart } from '#/lib/cart'
import { OPTION_KINDS, imgUrl, optionKind, optionText, priceOf, tzs, waLink } from '#/lib/format'
import { fontAttr, fontPreload } from '#/lib/theme'
import { shopAddress } from '#/lib/host'
import { useT } from '#/lib/i18n'
import { breadcrumbSchema, canonical, homeCollection, productDescription, productPath, productSchema, productTitle } from '#/lib/seo'
import { shareLink, useOrigin } from '#/lib/share'

/** A product at its readable address: shopi.tz/<shop>/<product>. */
export const Route = createFileRoute('/$shop/$product')({
  loader: async ({ params, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    const products = loaderData?.products ?? []
    const product = products.find((p) => p.slug === params.product) ?? products.find((p) => p.id === params.product)
    if (!product) throw notFound()
    // One address per product: an id in the link moves to the readable name.
    if (product.slug && product.slug !== params.product) {
      throw redirect({ to: '/$shop/$product', params: { shop: params.shop, product: product.slug }, statusCode: 301 })
    }
    const shop = loaderData!.shop
    return { product, shop, collection: homeCollection(loaderData!.collections, product.id), origin: loaderData!.origin }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] }
    const { product: p, shop, collection, origin } = loaderData
    const title = productTitle(p, shop)
    const description = productDescription(p, shop)
    const path = productPath(shop, p)
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: `${origin}${path}` },
        { name: 'twitter:card', content: 'summary_large_image' },
        ...(p.images[0] ? [{ property: 'og:image', content: `${origin}${imgUrl(p.images[0])}` }] : []),
        productSchema(p, shop, description),
        breadcrumbSchema([
          [shop.name, `/${shop.slug}`],
          ...(collection ? [[collection.name, `/${shop.slug}/c/${collection.slug}`] as [string, string]] : []),
          [p.name, path],
        ]),
      ],
      links: [canonical(path), ...fontPreload(shop.theme_font)],
    }
  },
  notFoundComponent: ProductNotFound,
  component: ProductPage,
})

function ProductNotFound() {
  const { shop } = Route.useParams()
  return <NotFound title="This product is not here" body="It may have sold out and been removed. The shop has more." href={`/${shop}`} action="See the shop" />
}
const parent = getRouteApi('/$shop')

function ProductPage() {
  const rise = useEntrance()
  const t = useT()
  const navigate = useNavigate()
  const { shop, products, areas } = parent.useLoaderData()
  const { product: p, collection } = Route.useLoaderData()
  const cart = useCart(shop.id)
  const origin = useOrigin()
  const [size, setSize] = useState<string | null>(p.sizes?.length === 1 ? p.sizes[0].label : null)
  const [qty, setQty] = useState(1)
  const [needSize, setNeedSize] = useState(false)
  const [added, setAdded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slide, setSlide] = useState(0)
  const [notify, setNotify] = useState(false)
  const gallery = useRef<HTMLDivElement>(null)
  /** "Dress, Colour Red" for an option's own photo, otherwise "Dress, photo 2". */
  const photoAlt = (k: string | null, i: number) => {
    const option = k ? p.sizes?.find((s) => s.image === k) : undefined
    return `${p.name}, ${option ? optionText(t, p.option_name, option.label) : t('photo {n}', { n: i + 1 })}`
  }

  useEffect(() => {
    track('view_product', { shopId: shop.id, productId: p.id })
    setSize(p.sizes?.length === 1 ? p.sizes[0].label : null)
    setQty(1)
    setSlide(0)
    setAdded(false)
    gallery.current?.scrollTo({ left: 0 })
  }, [shop.id, p.id, p.sizes])

  const chosen = p.sizes?.find((s) => s.label === size)
  const left = p.sizes ? (chosen ? chosen.stock : null) : p.stock
  const soldOut = p.stock === 0
  const max = left ?? 99
  const images = p.images.length ? p.images : [null]
  const more = products.filter((x) => x.id !== p.id && x.stock !== 0).slice(0, 4)
  const bagTotal = cart.lines.reduce((s, l) => {
    const x = products.find((y) => y.id === l.productId)
    return s + (x ? priceOf(x, l.size) : 0) * l.qty
  }, 0)
  // Options may cost different amounts: before a choice the price reads "From", after it the option's own.
  const kind = OPTION_KINDS[optionKind(p.option_name)]
  const shown = shownPrice(p, chosen?.label)
  const sale = !!shown.compare_price
  const unit = shown.price
  // Sold out, or the chosen option is: the buyer can ask for a WhatsApp message when it's back.
  const canNotify = p.sizes ? chosen?.stock === 0 : soldOut
  const { asked, remember } = useAsked(p.id, canNotify ? (chosen?.label ?? null) : null)
  const pay = [shop.lipa_number && t('Mobile money'), shop.cod_enabled && t('Cash on delivery')].filter(Boolean).join(', ')
  const lowStock = left != null && left > 0 && left <= 3

  function add() {
    if (p.sizes && !chosen) {
      setNeedSize(true)
      document.getElementById('sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    cart.add(lineKey(p.id, size), Math.min(qty, max))
    track('add_to_cart', { shopId: shop.id, productId: p.id, detail: 'page' })
    setAdded(true)
  }

  async function share() {
    const how = await shareLink(shopAddress(origin, shop.slug, `/${p.slug ?? p.id}`), p.name)
    if (how === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
    track('share', { shopId: shop.id, productId: p.id, detail: how === 'copied' ? 'copy' : 'native' })
  }

  /** Choosing an option with its own photo brings that photo up. */
  function choose(label: string) {
    setSize(label)
    setNeedSize(false)
    setQty(1)
    setAdded(false)
    const image = p.sizes?.find((s) => s.label === label)?.image
    const at = image ? p.images.indexOf(image) : -1
    if (at >= 0) goTo(at)
  }

  function goTo(i: number) {
    setSlide(i)
    const el = gallery.current
    if (el && el.clientWidth) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh bg-card pb-28 md:pb-0" data-font={fontAttr(shop.theme_font)}>
      <div className="hidden md:block">
        <ShopTopBar
          shop={shop}
          right={
            <>
              <button type="button" className="icon-btn" aria-label={t('Share')} onClick={share}>
                <Share2 size={17} strokeWidth={1.6} />
              </button>
              <BagButton shopSlug={shop.slug} count={cart.count} />
            </>
          }
        />
      </div>

      <main className="mx-auto max-w-[1280px] md:px-10 md:pt-10">
        <div className="md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 lg:gap-20">
          {/* Photos: swipe on phones; a large photo with thumbnails on desktop */}
          <div className="relative md:sticky md:top-26 md:self-start">
            <div
              ref={gallery}
              className="hide-scroll flex snap-x snap-mandatory overflow-x-auto md:overflow-hidden md:rounded-[20px]"
              onScroll={(e) => {
                const el = e.currentTarget
                if (el.clientWidth) setSlide(Math.round(el.scrollLeft / el.clientWidth))
              }}
            >
              {images.map((k, i) => (
                <Img key={k ?? i} k={k} alt={photoAlt(k, i)} priority={i === 0} className="aspect-[4/5] w-full shrink-0 snap-center" />
              ))}
            </div>

            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(16px,env(safe-area-inset-top))] md:hidden">
              <button
                type="button"
                aria-label={t('Back')}
                className="icon-btn bg-card/90 shadow-[0_1px_2px_rgb(10_10_10/0.08)] backdrop-blur"
                onClick={() => (window.history.length > 1 ? window.history.back() : navigate({ to: '/$shop', params: { shop: shop.slug } }))}
              >
                <ArrowLeft size={18} strokeWidth={1.75} />
              </button>
              <div className="flex gap-2">
                <button type="button" aria-label={t('Share')} className="icon-btn bg-card/90 shadow-[0_1px_2px_rgb(10_10_10/0.08)] backdrop-blur" onClick={share}>
                  <Share2 size={17} strokeWidth={1.6} />
                </button>
                <BagButton shopSlug={shop.slug} count={cart.count} />
              </div>
            </div>
            {images.length > 1 && (
              <span className="tnum absolute right-4 bottom-4 rounded-full bg-ink/70 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur md:hidden">
                {slide + 1} / {images.length}
              </span>
            )}
            {images.length > 1 && (
              <div className="mt-3 hidden gap-3 md:flex">
                {p.images.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={t('Photo {n}', { n: i + 1 })}
                    aria-pressed={slide === i}
                    onClick={() => goTo(i)}
                    className={`overflow-hidden rounded-[12px] transition-shadow ${slide === i ? 'shadow-[0_0_0_2px_var(--color-ink)]' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <Img size="thumb" k={k} alt="" className="h-20 w-16" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`${rise} px-4 pt-6 md:px-0 md:pt-2`}>
            <nav aria-label={t('Breadcrumb')}>
              <ol className="flex min-w-0 items-center gap-1.5 text-[14px] text-muted">
                <li className="min-w-0 truncate">
                  <Link to="/$shop" params={{ shop: shop.slug }} className="transition-colors hover:text-ink">
                    {shop.name}
                  </Link>
                </li>
                {collection && (
                  <>
                    <li aria-hidden className="text-faint">
                      ›
                    </li>
                    <li className="min-w-0 truncate">
                      <Link to="/$shop/c/$slug" params={{ shop: shop.slug, slug: collection.slug }} className="transition-colors hover:text-ink">
                        {collection.name}
                      </Link>
                    </li>
                  </>
                )}
              </ol>
            </nav>
            <h1 className="title mt-2 text-[26px] md:text-[40px] lg:text-[46px]">{p.name}</h1>
            <div className="mt-3 flex items-center gap-3">
              <Price p={shown} size="lg" />
              {sale && !soldOut && <Tag hot>−{Math.round((1 - shown.price / shown.compare_price!) * 100)}%</Tag>}
              {soldOut && <Tag>{t('Sold out')}</Tag>}
            </div>

            {p.sizes && (
              <div id="sizes" className="mt-8 scroll-mt-24">
                <div className="mb-3 flex items-baseline justify-between">
                  <p className="text-[14px] font-medium">{chosen ? optionText(t, p.option_name, chosen.label) : t(kind.choose)}</p>
                  {lowStock && chosen && <p className="text-[13px] text-moto-ink">{t('Only {n} left', { n: left! })}</p>}
                </div>
                <div className={`flex flex-wrap gap-2 rounded-[22px] ${needSize && !chosen ? 'outline-2 outline-offset-[6px] outline-moto' : ''}`}>
                  {p.sizes.map((s) => (
                    <OptionChip key={s.label} option={s} soldOut={s.stock === 0} selected={size === s.label} onClick={() => choose(s.label)} />
                  ))}
                </div>
                {needSize && !chosen && <p className="mt-3 text-[13px] text-moto-ink">{t(kind.choose)}</p>}
              </div>
            )}
            {!p.sizes && lowStock && <p className="mt-5 text-[13px] text-moto-ink">{t('Only {n} left', { n: left! })}</p>}
            {canNotify && (
              <p className="fade mt-5 text-[14px] leading-relaxed text-ink-2">
                {asked
                  ? t('You asked {shop} to message you on WhatsApp when it’s back.', { shop: shop.name })
                  : t('Sold out for now. Leave your WhatsApp number and {shop} will message you when it’s back.', { shop: shop.name })}
              </p>
            )}

            {!canNotify && (
              <div className="mt-6 flex items-center justify-between md:hidden">
                <p className="text-[14px] font-medium">{t('Quantity')}</p>
                <Qty qty={qty} max={max} onChange={setQty} />
              </div>
            )}

            {/* Desktop buttons. Phones use the bar at the bottom. */}
            <div className="mt-8 hidden gap-3 md:flex">
              {!canNotify && <Qty qty={qty} max={max} onChange={setQty} big />}
              {added ? (
                <Link to="/$shop/checkout" params={{ shop: shop.slug }} className="btn btn-shop btn-lg flex-1">
                  {t('Go to checkout')} <span className="tnum text-white/60">{tzs(bagTotal)}</span>
                </Link>
              ) : canNotify ? (
                <button type="button" className="btn btn-shop btn-lg flex-1" disabled={asked} onClick={() => setNotify(true)}>
                  {asked ? <Check size={18} strokeWidth={2.25} /> : <Bell size={18} strokeWidth={1.75} />}
                  {asked ? t('You’ll get a WhatsApp message') : t('Notify me when it’s back')}
                </button>
              ) : (
                <AddButton label={soldOut && !chosen ? t(kind.choose) : undefined} onAdd={add} big />
              )}
            </div>
            {added && (
              <p className="fade mt-3 hidden items-center gap-2 text-[14px] text-ink-2 md:flex">
                <Check size={16} strokeWidth={2} /> {t('Added to your bag.')}{' '}
                <Link to="/$shop" params={{ shop: shop.slug }} className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  {t('Keep shopping')}
                </Link>
              </p>
            )}

            {p.description && <p className="mt-8 max-w-[60ch] text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{p.description}</p>}

            <dl className="mt-8 rounded-[20px] bg-page px-5 py-1">
              <Detail label={t('Delivery')}>
                {t('Fee agreed on WhatsApp')}
                {areas.length > 0 && <span className="text-muted"> · {t(areas.length === 1 ? '{n} area' : '{n} areas', { n: areas.length })}</span>}
              </Detail>
              {pay && <Detail label={t('Payment')}>{pay}</Detail>}
              {p.sizes && <Detail label={t(kind.label)}>{p.sizes.map((s) => s.label).join(', ')}</Detail>}
              <Detail label={t('Availability')}>
                {soldOut ? t('Sold out') : lowStock ? <span className="text-moto-ink">{t('Only {n} left', { n: left! })}</span> : t('In stock')}
              </Detail>
            </dl>

            {shop.whatsapp && (
              <a
                className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
                href={waLink(
                  shop.whatsapp,
                  t('Hi {shop}, I am asking about {product} ({price})', {
                    shop: shop.name,
                    product: chosen ? `${p.name}, ${optionText(t, p.option_name, chosen.label)}` : p.name,
                    price: tzs(unit),
                  }),
                )}
                target="_blank"
                rel="noreferrer"
                onClick={() => track('whatsapp_click', { shopId: shop.id, productId: p.id, detail: 'product' })}
              >
                <WhatsAppMark size={18} /> {t('Ask about this on WhatsApp')}
              </a>
            )}

            <div className="mt-8 rounded-[20px] p-5 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <p className="text-[15px] font-medium">{t('Share with a friend')}</p>
              <p className="mt-0.5 text-[13px] text-muted">{t('Send it on WhatsApp, or copy the link for anywhere else')}</p>
              <div className="mt-4">
                <ShareActions
                  url={shopAddress(origin, shop.slug, `/${p.slug ?? p.id}`)}
                  title={p.name}
                  text={t('{name}, {price}, at {shop}', { name: p.name, price: tzs(p.price), shop: shop.name })}
                  onShared={(how) => track('share', { shopId: shop.id, productId: p.id, detail: how })}
                />
              </div>
            </div>
          </div>
        </div>

        {more.length > 0 && (
          <section className="mt-16 px-4 md:mt-24 md:px-0">
            <div className="mb-5 flex items-baseline justify-between gap-4 md:mb-8">
              <h2 className="title text-[20px] md:text-[26px]">{t('More from {shop}', { shop: shop.name })}</h2>
              <Link to="/$shop" params={{ shop: shop.slug }} className="shrink-0 text-[14px] text-muted transition-colors hover:text-ink">
                {t('See all')}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-6">
              {more.map((x) => (
                <ProductCard key={x.id} shopSlug={shop.slug} p={x} />
              ))}
            </div>
          </section>
        )}
      </main>
      <ShopFooter shop={shop} />

      {/* Phones: the buy bar is the same floating black capsule as the shop's navigation */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        <div className="pointer-events-auto mx-auto flex h-[68px] max-w-[440px] items-center gap-1.5 rounded-full bg-ink p-1.5 text-white shadow-[0_0_0_5px_rgb(10_10_10/0.06),0_20px_44px_-14px_rgb(10_10_10/0.6)] ring-1 ring-white/[0.14]">
          {added ? (
            <>
              <Link to="/$shop" params={{ shop: shop.slug }} className="fade flex h-full flex-1 items-center justify-center rounded-full px-3 text-[14px] font-medium text-white/80 transition-colors active:bg-white/10">
                {t('Keep shopping')}
              </Link>
              <Link
                to="/$shop/checkout"
                params={{ shop: shop.slug }}
                className="fade flex h-full flex-[1.4] items-center justify-center gap-2 rounded-full bg-white px-4 text-[15px] font-medium text-ink transition-transform active:scale-[0.97]"
              >
                {t('Checkout')} <span className="tnum text-[13px] text-ink-2">{tzs(bagTotal)}</span>
              </Link>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1 pl-4">
                <p className="tnum truncate text-[16px] font-semibold">{shown.from ? t('From {price}', { price: tzs(unit) }) : tzs(unit * qty)}</p>
                <p className="truncate text-[12px] text-white/55">
                  {p.sizes && !chosen
                    ? soldOut
                      ? t('Sold out')
                      : t(kind.choose)
                    : [chosen && optionText(t, p.option_name, chosen.label), canNotify && t('Sold out'), !canNotify && qty > 1 && t('{n} pieces', { n: qty })]
                        .filter(Boolean)
                        .join(' · ') || t('In stock')}
                </p>
              </div>
              {canNotify ? (
                <button
                  type="button"
                  disabled={asked}
                  onClick={() => setNotify(true)}
                  className="flex h-full shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-ink transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  {asked ? <Check size={17} strokeWidth={2.25} /> : <Bell size={17} strokeWidth={1.75} />}
                  {asked ? t('Asked') : t('Notify me')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={add}
                  className="flex h-full shrink-0 items-center justify-center rounded-full bg-white px-7 text-[15px] font-medium text-ink transition-transform active:scale-[0.97]"
                >
                  {soldOut && !chosen ? t(kind.choose) : t('Add to bag')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <Toast show={copied}>{t('Link copied')}</Toast>
      <NotifySheet shop={shop} product={p} size={canNotify ? (chosen?.label ?? null) : null} open={notify} onClose={() => setNotify(false)} onDone={remember} />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5 text-[14px] last:border-0">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Qty({ qty, max, onChange, big = false }: { qty: number; max: number; onChange: (n: number) => void; big?: boolean }) {
  const t = useT()
  return (
    <div className={`flex shrink-0 items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)] ${big ? 'h-14' : 'h-10'}`}>
      <button type="button" aria-label={t('Fewer')} disabled={qty <= 1} className={`flex h-full items-center justify-center text-ink-2 disabled:text-faint ${big ? 'w-12' : 'w-10'}`} onClick={() => onChange(Math.max(1, qty - 1))}>
        <Minus size={16} strokeWidth={1.75} />
      </button>
      <span className="tnum w-6 text-center text-[15px] font-medium">{qty}</span>
      <button type="button" aria-label={t('More')} disabled={qty >= max} className={`flex h-full items-center justify-center text-ink-2 disabled:text-faint ${big ? 'w-12' : 'w-10'}`} onClick={() => onChange(Math.min(max, qty + 1))}>
        <Plus size={16} strokeWidth={1.75} />
      </button>
    </div>
  )
}

function AddButton({ label, onAdd, big = false }: { label?: string; onAdd: () => void; big?: boolean }) {
  const t = useT()
  return (
    <button type="button" className={`btn btn-shop flex-1 ${big ? 'btn-lg' : 'px-8'}`} onClick={onAdd}>
      {label ?? t('Add to bag')}
    </button>
  )
}
