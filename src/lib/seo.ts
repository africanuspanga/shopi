import type React from 'react'
import type { PublicCollection, PublicProduct, PublicShop } from '#/lib/api/store'
import { CATEGORIES, OPTION_KINDS, imgUrl, optionKind, priceSpan, tzs } from '#/lib/format'
import { asLang, translate } from '#/lib/i18n'

/**
 * The live address. Canonical links and the sitemap always name it, so a tagged link (?s=ig, ?code=EID10) or a test copy
 * never competes with the real page in search. When shops get their own domains, a shop's pages name that domain instead.
 */
export const SITE = 'https://shopi.tz'

export const canonical = (path: string) => ({ rel: 'canonical', href: SITE + path })

/**
 * Structured data for search engines (schema.org), rendered as <script type="application/ld+json"> in the head. TanStack
 * renders this meta key as JSON-LD and escapes it, so a seller's text can't close the script; React Router's head type
 * doesn't list the key yet, hence the cast.
 */
export const ld = (data: Record<string, unknown>) => ({ 'script:ld+json': { '@context': 'https://schema.org', ...data } }) as React.JSX.IntrinsicElements['meta']

export const productPath = (shop: Pick<PublicShop, 'slug'>, p: Pick<PublicProduct, 'slug' | 'id'>) => `/${shop.slug}/${p.slug ?? p.id}`

/** The first title that fits what search results show (about 60 characters), or else the shortest. */
export function fitTitle(...options: string[]) {
  return options.find((o) => o.length <= 60) ?? options.reduce((a, b) => (b.length < a.length ? b : a))
}

/** Text cut at a word, at most `max` characters, with an ellipsis when it was cut. */
export function clip(text: string, max = 160) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

/** Two pieces of text as sentences: "Mavazi ya kike. Shop 24 products…", never "..". */
const join = (a: string, b: string) => {
  const lead = a.replace(/\s+/g, ' ').trim()
  return lead ? `${lead}${/[.!?…]$/.test(lead) ? '' : '.'} ${b}` : b
}

type T = (en: string, vars?: Record<string, string | number>) => string

/** Search and link-preview text reads in the shop's language, like its pages. */
const tFor = (shop: Pick<PublicShop, 'lang'>): T => (en, vars) => translate(asLang(shop.lang), en, vars)

/** The last sentence: how to order and pay at this shop. */
function payLine(shop: Pick<PublicShop, 'lipa_number' | 'cod_enabled'>, t: T) {
  if (shop.lipa_number && shop.cod_enabled) return t('Order online and pay by Lipa Namba or cash on delivery.')
  if (shop.lipa_number) return t('Order online and pay by Lipa Namba.')
  if (shop.cod_enabled) return t('Order online and pay cash on delivery.')
  return t('Order online, or ask the seller on WhatsApp.')
}

const placeOf = (shop: Pick<PublicShop, 'location'>) => shop.location.trim()

/** What the shop sells, in words: "Cosmetics", or "Shop" when the seller chose Other. */
function kindOf(shop: Pick<PublicShop, 'category'>, t: T) {
  const c = CATEGORIES.find((x) => x.id === shop.category)
  return t(c && c.id !== 'other' ? c.label : 'Shop')
}

export function shopTitle(shop: PublicShop) {
  const t = tFor(shop)
  const kind = kindOf(shop, t)
  const place = placeOf(shop)
  const what = place ? t('{kind} in {place}', { kind, place }) : kind
  return fitTitle(`${shop.name} · ${what} · Shopi`, `${shop.name} · ${what}`, `${shop.name} · ${kind} · Shopi`, `${shop.name} · Shopi`)
}

export function shopDescription(shop: PublicShop, products: number) {
  const t = tFor(shop)
  const vars = { n: products, shop: shop.name, place: placeOf(shop) }
  const facts = placeOf(shop)
    ? t(products === 1 ? 'Shop {n} product from {shop} in {place}.' : 'Shop {n} products from {shop} in {place}.', vars)
    : t(products === 1 ? 'Shop {n} product from {shop}.' : 'Shop {n} products from {shop}.', vars)
  return clip(join(shop.bio, `${facts} ${payLine(shop, t)}`))
}

/** "TSh 40,000", or "From TSh 35,000" when options cost different amounts. */
function priceWords(p: PublicProduct, t: T) {
  const { min, max } = priceSpan(p)
  return min === max ? tzs(min) : t('From {price}', { price: tzs(min) })
}

export function productTitle(p: PublicProduct, shop: PublicShop) {
  const price = priceWords(p, tFor(shop))
  return fitTitle(`${p.name} · ${price} · ${shop.name}`, `${p.name} · ${price}`)
}

export function productDescription(p: PublicProduct, shop: PublicShop) {
  const t = tFor(shop)
  const vars = { price: priceWords(p, t), shop: shop.name, place: placeOf(shop) }
  const at = placeOf(shop) ? t('{price} at {shop} in {place}.', vars) : t('{price} at {shop}.', vars)
  const options = p.sizes?.length ? ` ${t(OPTION_KINDS[optionKind(p.option_name)].label)}: ${p.sizes.map((s) => s.label).join(', ')}.` : ''
  // A long description from the seller says it best; a short one gets the facts after it.
  return p.description.trim().length >= 120 ? clip(p.description) : clip(join(p.description, `${at}${options} ${payLine(shop, t)}`))
}

export function collectionTitle(c: PublicCollection, shop: PublicShop) {
  return fitTitle(`${c.name} · ${shop.name} · Shopi`, `${c.name} · ${shop.name}`)
}

export function collectionDescription(c: PublicCollection, shop: PublicShop) {
  const t = tFor(shop)
  const n = c.productIds.length
  const lead = c.description || t('{name} from {shop}', { name: c.name, shop: shop.name })
  return clip(join(lead, `${t(n === 1 ? '{n} product' : '{n} products', { n })}. ${payLine(shop, t)}`))
}

/** The shop as a store: name, link, logo, area, WhatsApp and socials. */
export function storeSchema(shop: PublicShop, description: string) {
  const sameAs = [
    shop.instagram && `https://instagram.com/${shop.instagram}`,
    shop.tiktok && `https://tiktok.com/@${shop.tiktok}`,
    shop.facebook && (shop.facebook.startsWith('http') ? shop.facebook : `https://${shop.facebook}`),
  ].filter(Boolean)
  return ld({
    '@type': 'Store',
    '@id': `${SITE}/${shop.slug}#store`,
    name: shop.name,
    url: `${SITE}/${shop.slug}`,
    description,
    ...(shop.logo_key ? { logo: SITE + imgUrl(shop.logo_key), image: SITE + imgUrl(shop.logo_key) } : {}),
    ...(shop.whatsapp ? { telephone: shop.whatsapp } : {}),
    ...(shop.location.trim() ? { address: { '@type': 'PostalAddress', addressLocality: shop.location.trim(), addressCountry: 'TZ' } } : {}),
    ...(shop.maps_url ? { hasMap: shop.maps_url } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    currenciesAccepted: 'TZS',
    paymentAccepted: [shop.lipa_number && 'Mobile money', shop.cod_enabled && 'Cash'].filter(Boolean).join(', ') || undefined,
  })
}

/** A product with its price in shillings and whether it can be bought now; a price range when options cost different amounts. */
export function productSchema(p: PublicProduct, shop: PublicShop, description: string) {
  const url = SITE + productPath(shop, p)
  const { min, max } = priceSpan(p)
  const inStock = p.sizes?.length ? p.sizes.some((s) => s.stock !== 0) : p.stock !== 0
  const availability = `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`
  const seller = { '@type': 'Organization', name: shop.name, url: `${SITE}/${shop.slug}` }
  return ld({
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    url,
    description,
    sku: p.id,
    image: p.images.map((k) => SITE + imgUrl(k)),
    offers:
      min === max
        ? { '@type': 'Offer', url, price: min, priceCurrency: 'TZS', availability, seller }
        : { '@type': 'AggregateOffer', url, lowPrice: min, highPrice: max, offerCount: p.sizes!.length, priceCurrency: 'TZS', availability, seller },
  })
}

/** Shop › Collection › Product, as search results show it. Each step is [name, path]. */
export function breadcrumbSchema(steps: [string, string][]) {
  return ld({
    '@type': 'BreadcrumbList',
    itemListElement: steps.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
  })
}

/** The collection a product sits under for breadcrumbs: the first one in the seller's order that holds it. */
export const homeCollection = (collections: PublicCollection[], productId: string) => collections.find((c) => c.productIds.includes(productId)) ?? null
