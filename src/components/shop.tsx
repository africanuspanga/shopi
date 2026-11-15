import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Banknote, Check, Clock, FileText, MapPin, Smartphone, Truck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppMark } from '#/components/brand-icons'
import { Img, Sheet, ShopAvatar, Toast, Wordmark } from '#/components/ui'
import type { PublicProduct, PublicShop } from '#/lib/api/store'
import { track } from '#/lib/analytics'
import { lineKey, type Cart } from '#/lib/cart'
import { OPTION_KINDS, imageOf, optionKind, optionText, priceOf, priceSpan, tzs, waLink, formatTin, type Size } from '#/lib/format'
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

/** The Shopi bag (bag_body in design/brand/glyphs.py) with a plus cut through its face where the logo has its dot. */
function BagPlusIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="17 23 66 66" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M28 38H72a3 3 0 0 1 3 2.6l4 33.4a10 10 0 0 1-10 12H31a10 10 0 0 1-10-12L25 40.6a3 3 0 0 1 3-2.6zM46.75 53H53.25V59.75H60V66.25H53.25V73H46.75V66.25H40V59.75H46.75Z"
      />
      <path d="M40 41V36a10 10 0 0 1 20 0V41" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * A product in a grid. On desktop, hovering shows the second photo. The round bag button adds it without leaving the grid;
 * once the product is in the bag it turns Moto and shows how many, like the bag count in the capsule.
 */
export function ProductCard({
  shopSlug,
  p,
  onOpen,
  onQuickAdd,
  inBag = 0,
  eager = false,
}: {
  shopSlug: string
  p: PublicProduct
  onOpen?: () => void
  onQuickAdd?: (p: PublicProduct) => void
  inBag?: number
  eager?: boolean
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
            sizes={GRID_SIZES}
            className={`absolute inset-0 h-full w-full transition-opacity duration-500 ease-out ${second && peek ? 'group-hover:opacity-0' : ''} ${soldOut ? 'opacity-50' : ''}`}
          />
          {second && peek && <Img k={second} sizes={GRID_SIZES} alt="" className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100" />}
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
      {onQuickAdd && !soldOut && (
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/5]">
          <button
            type="button"
            aria-label={inBag ? t('{name}: {n} in your bag. Add another', { name: p.name, n: inBag }) : t('Add {name} to bag', { name: p.name })}
            onClick={() => onQuickAdd(p)}
            className={`pointer-events-auto absolute right-2.5 bottom-2.5 flex h-10 min-w-10 items-center justify-center rounded-full px-2.5 shadow-[0_0_0_2px_rgb(255_255_255/0.85),0_6px_16px_-6px_rgb(10_10_10/0.35)] transition-[transform,background-color,color] duration-150 ease-out active:scale-95 ${inBag ? 'bg-moto text-on-moto' : 'bg-ink text-white hover:bg-ink-2'}`}
          >
            {inBag ? <span className="tnum text-[15px] font-semibold">{inBag}</span> : <BagPlusIcon />}
          </button>
        </div>
      )}
    </div>
  )
}

/** Quick add: pick a size and drop it in the bag without opening the product. */
export function QuickAddSheet({ shopSlug, p, onClose, onAdd }: { shopSlug: string; p: PublicProduct | null; onClose: () => void; onAdd: (size: string | null) => void }) {
  const t = useT()
  const [size, setSize] = useState<string | null>(null)
  if (!p) return null
  const chosen = p.sizes?.find((s) => s.label === size)
  const low = chosen?.stock != null && chosen.stock > 0 && chosen.stock <= 3
  const kind = OPTION_KINDS[optionKind(p.option_name)]
  return (
    <Sheet open onClose={onClose} title={t('Add to bag')}>
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
        {p.sizes && !chosen ? t(kind.choose) : t('Add to bag')}
      </button>
    </Sheet>
  )
}

/**
 * A shop's products in a grid (2, 3 or 4 columns) with quick add: products with sizes open the sheet, others go
 * straight in the bag, and a toast says so. Used by the shop page and collection pages.
 */
export function ProductGrid({ shop, products, cart }: { shop: Pick<PublicShop, 'id' | 'slug'>; products: PublicProduct[]; cart: Cart }) {
  const t = useT()
  const [quick, setQuick] = useState<PublicProduct | null>(null)
  const [added, setAdded] = useState('')
  const inBag = (id: string) => cart.lines.reduce((n, l) => (l.productId === id ? n + l.qty : n), 0)

  function addToBag(p: PublicProduct, size: string | null) {
    cart.add(lineKey(p.id, size))
    track('add_to_cart', { shopId: shop.id, productId: p.id, detail: 'quick' })
    setQuick(null)
    setAdded(size ? t('{name} ({option}) is in your bag', { name: p.name, option: optionText(t, p.option_name, size) }) : t('{name} is in your bag', { name: p.name }))
    setTimeout(() => setAdded(''), 2200)
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 pt-5 md:grid-cols-3 md:gap-x-6 md:gap-y-12 md:pt-8 lg:grid-cols-4">
        {products.map((p, i) => (
          <ProductCard
            key={p.id}
            shopSlug={shop.slug}
            p={p}
            eager={i < 4}
            inBag={inBag(p.id)}
            onQuickAdd={(x) => (x.sizes ? setQuick(x) : addToBag(x, null))}
          />
        ))}
      </div>
      <QuickAddSheet key={quick?.id ?? 'none'} shopSlug={shop.slug} p={quick} onClose={() => setQuick(null)} onAdd={(size) => quick && addToBag(quick, size)} />
      <Toast show={!!added}>
        <Check size={16} strokeWidth={2.25} /> {added}
      </Toast>
    </>
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
export function DemoBanner() {
  const t = useT()
  return (
    <div className="bg-ink px-4 py-2.5 text-center text-[13px] leading-5 text-white">
      {t('Demo shop with sample products. Orders are switched off.')}{' '}
      <a href="/" className="font-medium whitespace-nowrap underline decoration-white/40 underline-offset-4 hover:decoration-white">
        {t('Open your own shop')}
      </a>
    </div>
  )
}

/** A shop whose plan ended: still visible, orders off, WhatsApp still works. Nothing is deleted. */
export function BreakBanner({ whatsapp, name }: { whatsapp: string; name: string }) {
  const t = useT()
  return (
    <div className="bg-ink px-4 py-2.5 text-center text-[13px] leading-5 text-white">
      {t('{shop} is taking a break. Orders are off for now.', { shop: name })}{' '}
      {whatsapp && (
        <a href={waLink(whatsapp)} className="font-medium whitespace-nowrap underline decoration-white/40 underline-offset-4 hover:decoration-white">
          {t('Message on WhatsApp')}
        </a>
      )}
    </div>
  )
}

export function MadeWithShopi() {
  const t = useT()
  return (
    <a href="/" className="mx-auto mt-12 flex w-fit items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink">
      {t('Shop made with')} <Wordmark className="h-[14px] w-auto" />
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
      <a
        href="/"
        className="group mt-8 flex items-center justify-between gap-4 rounded-[20px] bg-page px-5 py-4 transition-colors hover:bg-well"
      >
        <span className="flex items-center gap-2 text-[13px] text-muted">
          {t('Shop made with')} <Wordmark className="h-[14px] w-auto text-ink" />
        </span>
        <span className="flex items-center gap-1 text-[13px] font-medium">
          {t('Open your own shop')} <ArrowUpRight size={15} strokeWidth={1.75} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </a>
    </footer>
  )
}

/**
 * The shop's name and logo, pinned to the top. With `reveal`, phones keep it out of sight until the page's own header
 * has scrolled away, so the name never shows twice; from md up it is always there.
 */
export function ShopTopBar({ shop, right, reveal }: { shop: PublicShop; right?: ReactNode; reveal?: boolean }) {
  const place =
    reveal === undefined
      ? 'sticky'
      : `fixed inset-x-0 transition-transform duration-300 ease-out md:sticky md:translate-y-0 ${reveal ? 'translate-y-0' : '-translate-y-full'}`
  return (
    <header className={`${place} top-0 z-30 border-b border-line bg-card/90 backdrop-blur-md`}>
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 md:px-10">
        <Link to="/$shop" params={{ shop: shop.slug }} className="flex min-w-0 flex-1 items-center gap-3">
          <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-9 w-9 text-[13px]" />
          <span className="truncate text-[15px] font-semibold">{shop.name}</span>
        </Link>
        {right}
      </div>
    </header>
  )
}
