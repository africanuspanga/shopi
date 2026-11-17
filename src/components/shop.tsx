import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Banknote, Clock, FileText, MapPin, Search, Smartphone, Truck, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppMark } from '#/components/brand-icons'
import { Img, Sheet, ShopAvatar, Wordmark } from '#/components/ui'
import type { PublicProduct, PublicShop } from '#/lib/api/store'
import { openedFrom, track } from '#/lib/analytics'
import { lineKey, type Cart } from '#/lib/cart'
import { OPTION_KINDS, imageOf, optionKind, optionText, priceOf, priceSpan, tzs, waLink, formatTin, type Size } from '#/lib/format'
import { refLink } from '#/lib/host'
import { useT } from '#/lib/i18n'

type Priced = Pick<PublicProduct, 'price' | 'compare_price'> & { sizes?: Size[] | null }

/**
 * The price to show: the chosen option's, or, before a choice, the lowest with "From" when options cost different amounts.
 * The "was" price belongs to the product's own price, so an option with a price of its own never shows one.
 */
export function shownPrice(p: Priced, size?: string | null) {
  const sizes = p.sizes ?? null
  const was = (price: number) => (price === p.price && p.compare_price && p.compare_price > price ? p.compare_price : null)
  if (size) {
    const price = priceOf({ price: p.price, sizes }, size)
    return { price, compare_price: was(price), from: false }
  }
  const { min, max } = priceSpan({ price: p.price, sizes })
  return { price: min, compare_price: min === max ? was(min) : null, from: min !== max }
}
export const onSale = (p: Priced) => !!shownPrice(p).compare_price
/** Text as a buyer types it, for matching: lowercase, accents off. */
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')

/**
 * Whether a product matches what a buyer typed: every word is in its name or description, or is one of its options
 * still in stock ("m", "42", "red"). The shop's search field and the phone's search sheet share this.
 */
export function matchesSearch(p: PublicProduct, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = fold(`${p.name} ${p.description}`)
  const options = (p.sizes ?? []).filter((s) => s.stock == null || s.stock > 0).map((s) => fold(s.label))
  return words.every((w) => text.includes(w) || options.includes(w))
}

/** The shop's own search field: filters the products on the page as the buyer types. */
export function ShopSearch({ value, onChange, shopName, className = '' }: { value: string; onChange: (v: string) => void; shopName: string; className?: string }) {
  const t = useT()
  return (
    <label className={`input flex h-11 items-center gap-2 px-4 md:h-10 ${className}`}>
      <Search size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none md:text-[14px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={t('Search {shop}', { shop: shopName })}
        aria-label={t('Search {shop}', { shop: shopName })}
      />
      {value && (
        <button type="button" className="-mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-well hover:text-ink" aria-label={t('Clear search')} onClick={() => onChange('')}>
          <X size={15} strokeWidth={1.75} />
        </button>
      )}
    </label>
  )
}

export const discount = (p: Priced) => {
  const s = shownPrice(p)
  return Math.round((1 - s.price / (s.compare_price || s.price)) * 100)
}

/** Sizes still in stock, in the order the seller set them. */
const sizesLeft = (p: PublicProduct) => (p.sizes ?? []).filter((s) => s.stock == null || s.stock > 0)

export function Price({ p, size = 'sm' }: { p: { price: number; compare_price: number | null; from?: boolean }; size?: 'sm' | 'lg' }) {
  const t = useT()
  const was = !p.from && p.compare_price && p.compare_price > p.price
  return (
    <p className={`tnum flex flex-wrap items-baseline gap-x-2 ${size === 'lg' ? 'text-[22px] font-medium tracking-[-0.01em]' : 'text-[14px] font-medium'}`}>
      <span>{p.from ? t('From {price}', { price: tzs(p.price) }) : tzs(p.price)}</span>
      {was && <span className={`font-normal text-muted line-through ${size === 'lg' ? 'text-[16px]' : 'text-[13px]'}`}>{tzs(p.compare_price!)}</span>}
    </p>
  )
}

/** A choice chip: the option's own photo in a circle when it has one. */
export function OptionChip({
  option,
  selected,
  disabled,
  soldOut,
  onClick,
  className = '',
}: {
  option: Size
  selected: boolean
  disabled?: boolean
  /** Sold out but still choosable, so the buyer can ask to hear when it's back. */
  soldOut?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      data-soldout={soldOut || undefined}
      onClick={onClick}
      className={`chip tnum h-11 min-w-14 justify-center text-[14px] ${option.image ? 'pr-4 pl-1.5' : 'px-4'} ${className}`}
    >
      {option.image && <Img size="thumb" k={option.image} alt="" className="h-8 w-8 rounded-full" />}
      {option.label}
    </button>
  )
}

export function Tag({ children, hot = false }: { children: ReactNode; hot?: boolean }) {
  return (
    <span className={`tnum inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium ${hot ? 'bg-moto text-on-moto' : 'bg-card text-ink'}`}>
      {children}
    </span>
  )
}

/** How wide a grid photo shows: 2 columns on phones, 3 on tablets, 4 on desktop. */
const GRID_SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw'

/**
 * A product in a grid. On desktop, hovering shows the second photo. With `onBuy`, a "Buy" ("Nunua") pill sits on the photo:
 * the 17 Nov research found a bag-and-plus icon unclear to buyers here, so the card says what it does in one word.
 */
export function ProductCard({
  shopSlug,
  p,
  onOpen,
  onBuy,
  eager = false,
  sizes = GRID_SIZES,
}: {
  shopSlug: string
  p: PublicProduct
  onOpen?: () => void
  onBuy?: (p: PublicProduct) => void
  eager?: boolean
  /** How wide the photo shows, for the browser's choice of the 600 or 1200 px copy. */
  sizes?: string
}) {
  const t = useT()
  const soldOut = p.stock === 0
  const left = sizesLeft(p)
  const second = p.images[1]
  // The second photo loads only once a mouse arrives, so phones never spend data on it.
  const [peek, setPeek] = useState(false)
  return (
    <div className="group relative" onPointerEnter={(e) => e.pointerType === 'mouse' && setPeek(true)}>
      <Link to="/$shop/$product" params={{ shop: shopSlug, product: p.slug ?? p.id }} onClick={onOpen} className="block rounded-[16px] focus-visible:outline-offset-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[16px] bg-well">
          <Img
            k={p.images[0]}
            alt={p.name}
            eager={eager}
            sizes={sizes}
            className={`absolute inset-0 h-full w-full transition-opacity duration-500 ease-out ${second && peek ? 'group-hover:opacity-0' : ''} ${soldOut ? 'opacity-50' : ''}`}
          />
          {second && peek && <Img k={second} sizes={sizes} alt="" className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100" />}
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            {soldOut ? <Tag>{t('Sold out')}</Tag> : onSale(p) ? <Tag hot>−{discount(p)}%</Tag> : null}
          </div>
        </div>
        <div className="mt-3 px-0.5">
          <p className="line-clamp-1 text-[14px] leading-5">{p.name}</p>
          <div className="mt-0.5">
            <Price p={shownPrice(p)} />
          </div>
          {p.sizes && !soldOut && <p className="meta mt-1 line-clamp-1">{left.map((s) => s.label).join(' · ')}</p>}
        </div>
      </Link>
      {onBuy && !soldOut && (
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/5]">
          {/* The shop's button colour (black unless white text reads on the shop's own colour), ringed so it holds on any photo. */}
          <button
            type="button"
            aria-label={t('Buy {name}', { name: p.name })}
            onClick={() => onBuy(p)}
            className="btn btn-shop btn-sm pointer-events-auto absolute right-2.5 bottom-2.5 h-9 px-4 text-white shadow-[0_0_0_2px_rgb(255_255_255/0.85),0_6px_16px_-6px_rgb(10_10_10/0.35)]"
          >
            {t('Buy')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Buying from a card a product with options: choose one, then Buy puts it in the bag and opens checkout. */
export function QuickAddSheet({ shopSlug, p, onClose, onAdd }: { shopSlug: string; p: PublicProduct | null; onClose: () => void; onAdd: (size: string | null) => void }) {
  const t = useT()
  const [size, setSize] = useState<string | null>(null)
  if (!p) return null
  const chosen = p.sizes?.find((s) => s.label === size)
  const low = chosen?.stock != null && chosen.stock > 0 && chosen.stock <= 3
  const kind = OPTION_KINDS[optionKind(p.option_name)]
  return (
    <Sheet open onClose={onClose} title={t(kind.choose)}>
      <div className="flex gap-4">
        <Img k={imageOf(p, chosen?.label)} size="thumb" alt={p.name} className="h-[100px] w-20 shrink-0 rounded-[12px]" />
        <div className="min-w-0 py-1">
          <p className="truncate text-[16px] font-medium">{p.name}</p>
          <div className="mt-1">
            <Price p={shownPrice(p, chosen?.label)} />
          </div>
          <Link to="/$shop/$product" params={{ shop: shopSlug, product: p.slug ?? p.id }} className="mt-2 inline-block text-[13px] text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
            {t('See photos and details')}
          </Link>
        </div>
      </div>
      {p.sizes && (
        <div className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[14px] font-medium">{chosen ? optionText(t, p.option_name, chosen.label) : t(kind.choose)}</p>
            {low && <p className="text-[13px] text-moto-ink">{t('Only {n} left', { n: chosen!.stock! })}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.sizes.map((s) => (
              <OptionChip key={s.label} option={s} disabled={s.stock === 0} selected={size === s.label} onClick={() => setSize(s.label)} />
            ))}
          </div>
        </div>
      )}
      <button type="button" className="btn btn-shop btn-lg mt-6 w-full" disabled={!!p.sizes && !chosen} onClick={() => onAdd(chosen?.label ?? null)}>
        {t('Buy')}
      </button>
    </Sheet>
  )
}

/**
 * Buy from a row of product cards: a product with options opens the sheet to choose one; then (or straight away) it goes in
 * the bag and the buyer lands on checkout, with anything already in the bag. `ui` is the sheet, rendered once beside the cards.
 */
function useQuickBuy(shop: Pick<PublicShop, 'id' | 'slug'>, cart: Cart) {
  const navigate = useNavigate()
  const [quick, setQuick] = useState<PublicProduct | null>(null)

  function buy(p: PublicProduct, size: string | null) {
    cart.add(lineKey(p.id, size))
    track('add_to_cart', { shopId: shop.id, productId: p.id, detail: 'quick' })
    setQuick(null)
    navigate({ to: '/$shop/checkout', params: { shop: shop.slug } })
  }

  return {
    open: (p: PublicProduct) => (p.sizes ? setQuick(p) : buy(p, null)),
    ui: <QuickAddSheet key={quick?.id ?? 'none'} shopSlug={shop.slug} p={quick} onClose={() => setQuick(null)} onAdd={(size) => quick && buy(quick, size)} />,
  }
}

/**
 * A shop's products in a grid (2, 3 or 4 columns), each with Buy. Used by the shop page and collection pages.
 * `eager` is how many photos load at once: the shop page passes 0 when Top picks sit above the grid.
 */
export function ProductGrid({ shop, products, cart, eager = 4 }: { shop: Pick<PublicShop, 'id' | 'slug'>; products: PublicProduct[]; cart: Cart; eager?: number }) {
  const quick = useQuickBuy(shop, cart)
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 pt-5 md:grid-cols-3 md:gap-x-6 md:gap-y-12 md:pt-8 lg:grid-cols-4">
        {products.map((p, i) => (
          <ProductCard key={p.id} shopSlug={shop.slug} p={p} eager={i < eager} onBuy={quick.open} />
        ))}
      </div>
      {quick.ui}
    </>
  )
}

/** Top picks show once at least this many can be bought (roadmap q-picks). */
export const MIN_PICKS = 2

/** The seller's top picks a buyer can order now: visible (getStorefront sends only those) and not sold out, in the seller's order. */
export function pickedProducts(picks: string[], products: PublicProduct[]) {
  return picks.flatMap((id) => products.filter((p) => p.id === id && p.stock !== 0))
}

/**
 * Top picks (roadmap q-picks, decision n6): up to four products the seller puts first, above the shop's chips and grid.
 * On phones they are a row of larger cards to swipe, the next one peeking in; from md up they sit four across.
 * The shop page shows it only with at least MIN_PICKS products; a tap on one tags its product view `pick`.
 */
export function TopPicks({ shop, products, cart }: { shop: Pick<PublicShop, 'id' | 'slug'>; products: PublicProduct[]; cart: Cart }) {
  const t = useT()
  const quick = useQuickBuy(shop, cart)
  return (
    <section aria-labelledby="top-picks" className="pb-8 md:pb-14">
      <h2 id="top-picks" className="title text-[20px] md:text-[26px]">
        {t('Top picks')}
      </h2>
      <div className="hide-scroll -mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 md:mx-0 md:mt-6 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:px-0">
        {products.map((p, i) => (
          <div key={p.id} className="w-[68%] max-w-[300px] shrink-0 snap-start md:w-auto md:max-w-none">
            <ProductCard
              shopSlug={shop.slug}
              p={p}
              eager={i < 2}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 22vw, 68vw"
              onBuy={quick.open}
              onOpen={() => openedFrom(p.id, 'pick')}
            />
          </div>
        ))}
      </div>
      {quick.ui}
    </section>
  )
}

/** Bag in the shop header: a pill with the count, which turns orange once something is in it. */
export function BagButton({ shopSlug, count }: { shopSlug: string; count: number }) {
  const t = useT()
  return (
    <Link
      to="/$shop/checkout"
      params={{ shop: shopSlug }}
      aria-label={t(count === 1 ? 'Bag, {n} item' : 'Bag, {n} items', { n: count })}
      className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-card pr-1 pl-4 text-[14px] font-medium shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-colors hover:bg-well"
    >
      {t('Bag')}
      <span className={`tnum flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[13px] transition-colors ${count ? 'bg-moto text-on-moto' : 'bg-ink text-white'}`}>
        {count}
      </span>
    </Link>
  )
}

type Fact = { icon: ReactNode; text: string; sub?: string; href?: string }

/** What a buyer wants to know before ordering: delivery, how to pay, where, when. */
function useShopFacts(shop: PublicShop, areas: { name: string; fee: number }[]): Fact[] {
  const t = useT()
  const facts: Fact[] = []
  if (areas.length)
    facts.push({
      icon: <Truck size={18} strokeWidth={1.5} />,
      text: t(areas.length === 1 ? 'Delivers to {n} area' : 'Delivers to {n} areas', { n: areas.length }),
      sub: t('Fee agreed on WhatsApp'),
    })
  if (shop.lipa_number)
    facts.push({
      icon: <Smartphone size={18} strokeWidth={1.5} />,
      text: t('Mobile money'),
      sub: shop.lipa_network ? t('{network} Lipa Namba', { network: shop.lipa_network }) : t('Lipa Namba'),
    })
  if (shop.cod_enabled) facts.push({ icon: <Banknote size={18} strokeWidth={1.5} />, text: t('Cash on delivery'), sub: t('Pay when it arrives') })
  if (shop.location || shop.maps_url)
    facts.push({ icon: <MapPin size={18} strokeWidth={1.5} />, text: shop.location || t('Directions'), href: shop.maps_url || undefined })
  if (shop.hours) facts.push({ icon: <Clock size={18} strokeWidth={1.5} />, text: shop.hours })
  if (shop.tin) facts.push({ icon: <FileText size={18} strokeWidth={1.5} />, text: `TIN ${formatTin(shop.tin)}`, sub: t('Registered with TRA') })
  return facts
}

export function ShopFacts({ shop, areas }: { shop: PublicShop; areas: { name: string; fee: number }[] }) {
  const t = useT()
  const facts = useShopFacts(shop, areas)
  if (!facts.length) return null
  const directions = (href: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-0.5 flex w-fit items-center gap-1 text-[13px] font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
    >
      {t('Directions')} <ArrowUpRight size={13} strokeWidth={1.75} />
    </a>
  )
  return (
    <ul className="divide-y divide-line">
      {facts.map((f) => (
        <li key={f.text} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <span className="mt-px shrink-0 text-ink-2">{f.icon}</span>
          <span className="min-w-0 text-[14px] leading-5">
            {f.href && !shop.location ? (
              directions(f.href)
            ) : (
              <>
                {f.text}
                {f.sub && <span className="block text-[13px] text-muted">{f.sub}</span>}
                {f.href && directions(f.href)}
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The same facts as a row of quiet pills, for the top of a shop on a phone. The written location is in the header already, so its pill only shows as a directions link. */
export function FactPills({ shop, areas }: { shop: PublicShop; areas: { name: string; fee: number }[] }) {
  const t = useT()
  const facts = useShopFacts(shop, areas).filter((f) => (f.href || f.text !== shop.location) && !f.text.startsWith('TIN '))
  if (!facts.length) return null
  const pill = 'flex h-9 shrink-0 items-center gap-2 rounded-full bg-page px-3.5 text-[13px] whitespace-nowrap text-ink-2 [&_svg]:size-4'
  return (
    <div className="hide-scroll -mx-4 flex gap-2 overflow-x-auto px-4">
      {facts.map((f) =>
        f.href ? (
          <a key={f.text} href={f.href} target="_blank" rel="noopener noreferrer" className={`${pill} text-ink transition-colors hover:bg-well`}>
            {f.icon}
            {t('Directions')}
          </a>
        ) : (
          <span key={f.text} className={pill}>
            {f.icon}
            {f.text}
          </span>
        ),
      )}
    </div>
  )
}

export function SocialLinks({ shop, whatsapp = true, className = '' }: { shop: PublicShop; whatsapp?: boolean; className?: string }) {
  const t = useT()
  const links = [
    whatsapp && shop.whatsapp && { href: waLink(shop.whatsapp, t('Hi {shop}, I found your shop on Shopi.', { shop: shop.name })), label: 'WhatsApp', icon: <WhatsAppMark size={20} /> },
    shop.instagram && { href: `https://instagram.com/${shop.instagram}`, label: 'Instagram', icon: <InstagramIcon /> },
    shop.tiktok && { href: `https://tiktok.com/@${shop.tiktok}`, label: 'TikTok', icon: <TikTokIcon /> },
    shop.facebook && { href: shop.facebook.startsWith('http') ? shop.facebook : `https://${shop.facebook}`, label: 'Facebook', icon: <FacebookIcon /> },
  ].filter(Boolean) as { href: string; label: string; icon: ReactNode }[]
  if (!links.length) return null
  return (
    <div className={`flex gap-2 ${className}`}>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          aria-label={l.label}
          title={l.label}
          className="icon-btn"
          onClick={() =>
            l.label === 'WhatsApp'
              ? track('whatsapp_click', { shopId: shop.id, detail: 'footer' })
              : track('social_click', { shopId: shop.id, detail: l.label.toLowerCase() })
          }
        >
          {l.icon}
        </a>
      ))}
    </div>
  )
}

/** Across the top of every page of a sample shop, so buyers know at once that nothing here is for sale. */
export function DemoBanner({ shopSlug }: { shopSlug: string }) {
  const t = useT()
  return (
    <div className="bg-ink px-4 py-2.5 text-center text-[13px] leading-5 text-white">
      {t('Demo shop with sample products. Orders are switched off.')}{' '}
      <a href={refLink(shopSlug, 'banner')} className="font-medium whitespace-nowrap underline decoration-white/40 underline-offset-4 hover:decoration-white">
        {t('Open your own shop')}
      </a>
    </div>
  )
}

/** A shop whose plan ended: still visible, orders off, WhatsApp still works. Nothing is deleted. */
/**
 * The quiet line at the end of checkout, bag links and the order page. With `invite` (the order page, where the buyer has
 * finished) it also says "Open your own shop"; checkout keeps only the line, so nothing pulls a buyer away mid-order.
 * Either way the link carries the shop (refLink), so a seller who signs up from it is counted for that shop.
 */
export function MadeWithShopi({ shopSlug, invite = false }: { shopSlug: string; invite?: boolean }) {
  const t = useT()
  return (
    <a
      href={refLink(shopSlug, invite ? 'order' : 'footer')}
      className="group mx-auto mt-12 flex w-fit flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-muted transition-colors hover:text-ink"
    >
      <span className="flex items-center gap-2">
        {t('Shop made with')} <Wordmark className="h-[14px] w-auto" />
      </span>
      {invite && (
        <span aria-hidden="true" className="text-faint">
          ·
        </span>
      )}
      {invite && (
        <span className="flex items-center gap-1 font-medium text-ink">
          {t('Open your own shop')} <ArrowUpRight size={14} strokeWidth={1.75} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      )}
    </a>
  )
}

/** The end of every shop page: who the seller is, where to follow them, and how to open a shop of your own. */
export function ShopFooter({ shop }: { shop: PublicShop }) {
  const t = useT()
  return (
    <footer className="mx-auto mt-20 max-w-[1280px] px-4 pb-10 md:px-10">
      <div className="flex flex-col gap-6 border-t border-line pt-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-11 w-11 text-[15px]" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{shop.name}</p>
            <p className="meta mt-0.5">shopi.tz/{shop.slug}</p>
          </div>
        </div>
        <SocialLinks shop={shop} />
      </div>
      {shop.badge && (
        <a
          href={refLink(shop.slug, 'footer')}
          className="group mt-8 flex items-center justify-between gap-4 rounded-[20px] bg-page px-5 py-4 transition-colors hover:bg-well"
        >
          <span className="flex items-center gap-2 text-[13px] text-muted">
            {t('Shop made with')} <Wordmark className="h-[14px] w-auto text-ink" />
          </span>
          <span className="flex items-center gap-1 text-[13px] font-medium">
            {t('Open your own shop')} <ArrowUpRight size={15} strokeWidth={1.75} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </a>
      )}
    </footer>
  )
}

/**
 * The shop's name and logo, pinned to the top. With `reveal`, phones keep it out of sight until the page's own header
 * has scrolled away, so the name never shows twice; from md up it is always there.
 */
/**
 * The bar at the top of every buyer page. On phones it is always there, 72px, with the shop's logo and name (in the
 * shop's own font) and the bag at the right; the pages don't repeat the name under it. From `md` up it is the 64px bar
 * with the page's own actions. `back` puts a back arrow first (product page, checkout); without `bagCount` no bag shows.
 */
export function ShopTopBar({
  shop,
  right,
  back,
  bagCount,
}: {
  shop: Pick<PublicShop, 'slug' | 'name' | 'logo_key'>
  right?: ReactNode
  back?: boolean
  bagCount?: number
}) {
  const t = useT()
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card pt-[env(safe-area-inset-top)] md:bg-card/90 md:backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-3 px-4 md:h-16 md:px-10">
        {back && (
          <button type="button" aria-label={t('Back')} className="icon-btn md:hidden" onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign(`/${shop.slug}`))}>
            <ArrowLeft size={18} strokeWidth={1.75} />
          </button>
        )}
        <Link to="/$shop" params={{ shop: shop.slug }} className="flex min-w-0 flex-1 items-center gap-3">
          <ShopAvatar name={shop.name} logo={shop.logo_key} className={`text-[13px] md:h-9 md:w-9 ${back ? 'h-9 w-9' : 'h-11 w-11'}`} />
          <span className={`title truncate md:text-[15px] md:font-semibold ${back ? 'text-[17px]' : 'text-[20px]'}`}>{shop.name}</span>
        </Link>
        {right}
        {bagCount !== undefined && (
          <Link
            to="/$shop/checkout"
            params={{ shop: shop.slug }}
            aria-label={t(bagCount === 1 ? 'Bag, {n} item' : 'Bag, {n} items', { n: bagCount })}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-card pr-1 pl-3.5 text-[14px] font-medium shadow-[inset_0_0_0_1px_var(--color-line-strong)] md:hidden"
          >
            {t('Bag')}
            <span className={`tnum flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[13px] transition-colors ${bagCount ? 'bg-moto text-on-moto' : 'bg-ink text-white'}`}>{bagCount}</span>
          </Link>
        )}
      </div>
    </header>
  )
}
