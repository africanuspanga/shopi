import { Link } from '@tanstack/react-router'
import { CalendarPlus, ChevronRight, Info, MessageCircleQuestion, Search, Share2, ShoppingBag, Store } from 'lucide-react'
import { useState } from 'react'
import { WhatsAppIcon } from '#/components/brand-icons'
import { FloatingNav, NavCenter, NavCount, NavTab } from '#/components/floating-nav'
import { Price, ShopFacts, SocialLinks, onSale, Tag, discount, matchesSearch, shownPrice } from '#/components/shop'
import { ShopQr } from '#/components/qr'
import { openAssistant } from '#/components/assistant'
import { openWhatsApp } from '#/components/whatsapp'
import { Img, Sheet, ShopAvatar } from '#/components/ui'
import { track } from '#/lib/analytics'
import type { PublicProduct, PublicShop } from '#/lib/api/store'
import type { PublicService } from '#/lib/api/booking'
import { serviceMeta } from '#/components/booking'
import { servicePrice } from '#/lib/booking'
import { waLink } from '#/lib/format'
import { useT } from '#/lib/i18n'

type Area = { name: string; fee: number }

/**
 * A shop on a phone: the floating capsule with Shop, Search, the bag in the middle, WhatsApp and Info.
 * `away`: on a page inside the shop (a collection), Shop goes back to the shop instead of to the top.
 */
export function ShopNav({
  shop,
  areas,
  products,
  services = [],
  count,
  onShare,
  away = false,
  ask = false,
}: {
  shop: PublicShop
  areas: Area[]
  products: PublicProduct[]
  /** What clients can book here. A shop that shows services first gets Book in the middle instead of the bag. */
  services?: PublicService[]
  count: number
  onShare: () => void
  away?: boolean
  /** The shop's AI assistant can be asked: Info and Search offer it (it never opens by itself). */
  ask?: boolean
}) {
  const t = useT()
  const [sheet, setSheet] = useState<'search' | 'info' | null>(null)
  const booksFirst = !away && services.length > 0 && (shop.kind === 'services' || products.length === 0)
  return (
    <>
      <FloatingNav label={shop.name}>
        {away ? (
          <NavTab icon={Store} label={t('Shop')} to="/$shop" params={{ shop: shop.slug }} />
        ) : (
          <NavTab icon={Store} label={t('Shop')} active={!sheet} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        )}
        <NavTab icon={Search} label={t('Search')} active={sheet === 'search'} onClick={() => setSheet('search')} />
        {booksFirst ? (
          services.length === 1 ? (
            <NavCenter icon={CalendarPlus} label={t('Book')} to="/$shop/book/$id" params={{ shop: shop.slug, id: services[0].id }} />
          ) : (
            <NavCenter icon={CalendarPlus} label={t('Book')} onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })} />
          )
        ) : (
          <NavCenter icon={ShoppingBag} label={t('Bag')} to="/$shop/checkout" params={{ shop: shop.slug }} badge={<NavCount n={count} />} />
        )}
        {shop.whatsapp ? (
          <NavTab
            icon={WhatsAppIcon}
            label="WhatsApp"
            href={waLink(shop.whatsapp, t('Hi {shop}, I found your shop on Shopi.', { shop: shop.name }))}
            onClick={(e) => {
              track('whatsapp_click', { shopId: shop.id, detail: 'shop' })
              openWhatsApp(e)
            }}
          />
        ) : (
          <NavTab icon={Share2} label={t('Share')} onClick={onShare} />
        )}
        <NavTab icon={Info} label={t('Info')} active={sheet === 'info'} onClick={() => setSheet('info')} />
      </FloatingNav>
      <SearchSheet open={sheet === 'search'} onClose={() => setSheet(null)} shop={shop} products={products} services={services} ask={ask} />
      <InfoSheet open={sheet === 'info'} onClose={() => setSheet(null)} shop={shop} areas={areas} onShare={onShare} ask={ask} />
    </>
  )
}

function SearchSheet({
  open,
  onClose,
  shop,
  products,
  services,
  ask,
}: {
  open: boolean
  onClose: () => void
  shop: PublicShop
  products: PublicProduct[]
  services: PublicService[]
  ask: boolean
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const needle = q.trim()
  const results = needle ? products.filter((p) => matchesSearch(p, needle)) : products.slice(0, 6)
  // Services answer the search too: by name, or all of them in a shop that sells nothing else.
  const found = needle ? services.filter((v) => v.name.toLowerCase().includes(needle.toLowerCase())) : products.length ? [] : services.slice(0, 8)
  return (
    <Sheet open={open} onClose={onClose} title={t('Search {shop}', { shop: shop.name })}>
      <label className="input flex items-center gap-2 px-4">
        <Search size={18} strokeWidth={1.75} className="shrink-0 text-muted" />
        <input
          autoFocus
          type="text"
          inputMode="search"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={products.length ? t('Dress, colour, size') : t('Search')}
          aria-label={t('Search')}
        />
      </label>
      {found.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {found.map((v) => (
            <li key={v.id}>
              <Link to="/$shop/book/$id" params={{ shop: shop.slug, id: v.id }} onClick={onClose} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-15">{v.name}</span>
                  <span className="block truncate text-13 text-muted">{[serviceMeta(t, v), servicePrice(t, v)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="btn btn-shop btn-sm h-9 shrink-0 px-4 text-white">{t('Book')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(products.length > 0 || found.length === 0) && <p className="meta mt-4">{needle ? t(results.length === 1 ? '{n} product' : '{n} products', { n: results.length }) : t('Newest')}</p>}
      {results.length === 0 && found.length > 0 ? null : results.length === 0 ? (
        <p className="mt-3 rounded-14 bg-page px-4 py-6 text-center text-14 leading-relaxed text-muted">
          {t('Nothing matches "{q}". Try another word, or ask the seller on WhatsApp.', { q: q.trim() })}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {results.map((p) => (
            <li key={p.id}>
              <Link to="/$shop/$product" params={{ shop: shop.slug, product: p.slug ?? p.id }} onClick={onClose} className="flex items-center gap-3 py-3">
                <Img size="thumb" k={p.images[0]} alt={p.name} className="h-16 w-[52px] shrink-0 rounded-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-15">{p.name}</span>
                  <Price p={shownPrice(p)} />
                </span>
                {p.stock === 0 ? <Tag>{t('Sold out')}</Tag> : onSale(p) ? <Tag hot>−{discount(p)}%</Tag> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {ask && needle && (
        // What the buyer typed, asked of the AI assistant: only when they tap it.
        <button
          type="button"
          className="mt-3 flex w-full items-center gap-3 rounded-16 px-4 py-3 text-left shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-page"
          onClick={() => {
            onClose()
            setQ('')
            openAssistant({ text: needle })
          }}
        >
          <MessageCircleQuestion size={18} strokeWidth={1.75} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-15 font-medium">{t('Ask the AI assistant')}</span>
            <span className="block truncate text-13 text-muted">“{needle}”</span>
          </span>
          <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
        </button>
      )}
    </Sheet>
  )
}

function InfoSheet({ open, onClose, shop, areas, onShare, ask }: { open: boolean; onClose: () => void; shop: PublicShop; areas: Area[]; onShare: () => void; ask: boolean }) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} title={t('About this shop')}>
      <div className="flex items-center gap-3">
        <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-12 w-12 text-15" />
        <div className="min-w-0">
          <p className="truncate text-15 font-semibold">{shop.name}</p>
          <p className="code truncate text-12 text-muted">shopi.tz/{shop.slug}</p>
        </div>
      </div>
      {shop.bio && <p className="mt-4 text-14 leading-relaxed text-ink-2">{shop.bio}</p>}
      <div className="mt-5 rounded-16 bg-page p-4">
        <ShopFacts shop={shop} areas={areas} short />
      </div>
      {ask && (
        <button
          type="button"
          className="mt-3 flex w-full items-center gap-3 rounded-16 px-4 py-3 text-left shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-page"
          onClick={() => {
            onClose()
            openAssistant()
          }}
        >
          <MessageCircleQuestion size={18} strokeWidth={1.75} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-15 font-medium">{t('Ask a question')}</span>
            <span className="block text-13 text-muted">{t('The AI assistant answers from this shop’s details.')}</span>
          </span>
          <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
        </button>
      )}
      <ShopQr shop={shop} className="mt-4" />
      {areas.length > 0 && (
        <div className="mt-6">
          <p className="text-14 font-medium">{t('Delivery areas')}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {areas.map((a) => (
              <li key={a.name} className="flex h-8 items-center rounded-full bg-page px-3 text-13 text-ink-2">
                {a.name}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-13 leading-5 text-muted">
            {shop.ships_regions
              ? t('Somewhere else? This shop also sends to other regions. Agree the fee with the seller on WhatsApp.')
              : t('Not on the list? Ask the seller on WhatsApp before you order. You agree the delivery fee there too.')}
          </p>
        </div>
      )}
      <div className="mt-6 flex items-center justify-between gap-3">
        <SocialLinks shop={shop} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onShare}>
          <Share2 size={16} strokeWidth={1.75} /> {t('Share shop')}
        </button>
      </div>
    </Sheet>
  )
}
