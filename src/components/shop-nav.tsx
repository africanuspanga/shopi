import { Link } from '@tanstack/react-router'
import { Info, Search, Share2, ShoppingBag, Store } from 'lucide-react'
import { useState } from 'react'
import { WhatsAppIcon } from '#/components/brand-icons'
import { FloatingNav, NavCenter, NavCount, NavTab } from '#/components/floating-nav'
import { Price, ShopFacts, SocialLinks, onSale, Tag, discount } from '#/components/shop'
import { Img, Sheet, ShopAvatar } from '#/components/ui'
import { track } from '#/lib/analytics'
import type { PublicProduct, PublicShop } from '#/lib/api/store'
import { tzs, waLink } from '#/lib/format'
import { useT } from '#/lib/i18n'

type Area = { name: string; fee: number }

/** A shop on a phone: the floating capsule with Shop, Search, the bag in the middle, WhatsApp and Info. */
export function ShopNav({ shop, areas, products, count, onShare }: { shop: PublicShop; areas: Area[]; products: PublicProduct[]; count: number; onShare: () => void }) {
  const t = useT()
  const [sheet, setSheet] = useState<'search' | 'info' | null>(null)
  return (
    <>
      <FloatingNav label={shop.name}>
        <NavTab icon={Store} label={t('Shop')} active={!sheet} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <NavTab icon={Search} label={t('Search')} active={sheet === 'search'} onClick={() => setSheet('search')} />
        <NavCenter icon={ShoppingBag} label={t('Bag')} to="/$shop/checkout" params={{ shop: shop.slug }} badge={<NavCount n={count} />} />
        {shop.whatsapp ? (
          <NavTab
            icon={WhatsAppIcon}
            label="WhatsApp"
            href={waLink(shop.whatsapp, t('Hi {shop}, I found your shop on RIZK.', { shop: shop.name }))}
            onClick={() => track('whatsapp_click', { shopId: shop.id, detail: 'shop' })}
          />
        ) : (
          <NavTab icon={Share2} label={t('Share')} onClick={onShare} />
        )}
        <NavTab icon={Info} label={t('Info')} active={sheet === 'info'} onClick={() => setSheet('info')} />
      </FloatingNav>
      <SearchSheet open={sheet === 'search'} onClose={() => setSheet(null)} shop={shop} products={products} />
      <InfoSheet open={sheet === 'info'} onClose={() => setSheet(null)} shop={shop} areas={areas} onShare={onShare} />
    </>
  )
}

function SearchSheet({ open, onClose, shop, products }: { open: boolean; onClose: () => void; shop: PublicShop; products: PublicProduct[] }) {
  const t = useT()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const results = needle
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.description.toLowerCase().includes(needle) ||
          (p.sizes ?? []).some((s) => s.label.toLowerCase() === needle && (s.stock == null || s.stock > 0)),
      )
    : products.slice(0, 6)
  return (
    <Sheet open={open} onClose={onClose} title={t('Search {shop}', { shop: shop.name })}>
      <label className="input flex items-center gap-2 px-4">
        <Search size={17} strokeWidth={1.6} className="shrink-0 text-muted" />
        <input
          autoFocus
          type="text"
          inputMode="search"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('Dress, colour, size')}
          aria-label={t('Search')}
        />
      </label>
      <p className="meta mt-4">{needle ? t(results.length === 1 ? '{n} product' : '{n} products', { n: results.length }) : t('Newest')}</p>
      {results.length === 0 ? (
        <p className="mt-3 rounded-[14px] bg-page px-4 py-6 text-center text-[14px] leading-relaxed text-muted">
          {t('Nothing matches "{q}". Try another word, or ask the seller on WhatsApp.', { q: q.trim() })}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {results.map((p) => (
            <li key={p.id}>
              <Link to="/$shop/$product" params={{ shop: shop.slug, product: p.slug ?? p.id }} onClick={onClose} className="flex items-center gap-3 py-3">
                <Img k={p.images[0]} alt={p.name} className="h-16 w-[52px] shrink-0 rounded-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{p.name}</span>
                  <Price p={p} />
                </span>
                {p.stock === 0 ? <Tag>{t('Sold out')}</Tag> : onSale(p) ? <Tag hot>−{discount(p)}%</Tag> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

function InfoSheet({ open, onClose, shop, areas, onShare }: { open: boolean; onClose: () => void; shop: PublicShop; areas: Area[]; onShare: () => void }) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} title={t('About this shop')}>
      <div className="flex items-center gap-3">
        <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-12 w-12 text-[16px]" />
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold">{shop.name}</p>
          <p className="code truncate text-[12px] text-muted">rizk.tz/{shop.slug}</p>
        </div>
      </div>
      {shop.bio && <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{shop.bio}</p>}
      <div className="mt-5 rounded-[16px] bg-page p-4">
        <ShopFacts shop={shop} areas={areas} />
      </div>
      {areas.length > 0 && (
        <div className="mt-6">
          <p className="text-[14px] font-medium">{t('Delivery areas')}</p>
          <ul className="mt-2 divide-y divide-line">
            {areas.map((a) => (
              <li key={a.name} className="flex justify-between gap-4 py-2.5 text-[14px]">
                <span className="text-ink-2">{a.name}</span>
                <span className="tnum">{a.fee ? tzs(a.fee) : t('Free')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">{t('Not on the list? Choose "My area is not listed" at checkout.')}</p>
        </div>
      )}
      <div className="mt-6 flex items-center justify-between gap-3">
        <SocialLinks shop={shop} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onShare}>
          <Share2 size={15} strokeWidth={1.6} /> {t('Share shop')}
        </button>
      </div>
    </Sheet>
  )
}
