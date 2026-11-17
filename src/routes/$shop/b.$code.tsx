import { Link, createFileRoute, getRouteApi, notFound, useNavigate } from '@tanstack/react-router'
import { ShoppingBag } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { CheckoutHeader, CheckoutView, type CheckoutLine } from '#/components/checkout'
import { NotFound } from '#/components/not-found'
import { MadeWithShopi } from '#/components/shop'
import { getBagLink, type PublicBag } from '#/lib/api/bags'
import type { PublicShop } from '#/lib/api/store'
import { track } from '#/lib/analytics'
import { imgUrl, localPhone, tzs, waLink } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { useEntrance } from '#/components/ui'

/** A bag the seller made for one buyer: shopi.tz/<shop>/b/<code>. It opens straight on checkout. */
export const Route = createFileRoute('/$shop/b/$code')({
  loader: async ({ params, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    if (!loaderData) throw notFound()
    const bag = await getBagLink({ data: { shopId: loaderData.shop.id, code: params.code } })
    if (!bag) throw notFound()
    return { bag, shopName: loaderData.shop.name, origin: loaderData.origin }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] }
    const { bag, shopName, origin } = loaderData
    const count = bag.lines.reduce((s, l) => s + l.qty, 0)
    const total = bag.lines.reduce((s, l) => s + l.price * l.qty, 0)
    const title = `Your bag from ${shopName}`
    return {
      meta: [
        { title: `${title} · Shopi` },
        // A link for one buyer: kept out of search engines.
        { name: 'robots', content: 'noindex' },
        { property: 'og:title', content: title },
        ...(bag.state === 'open' ? [{ property: 'og:description', content: `${count} ${count === 1 ? 'item' : 'items'} · ${tzs(total)}` }] : []),
        ...(bag.lines[0]?.image ? [{ property: 'og:image', content: `${origin}${imgUrl(bag.lines[0].image)}` }] : []),
      ],
    }
  },
  notFoundComponent: BagNotFound,
  component: BagPage,
})
const parent = getRouteApi('/$shop')

function BagNotFound() {
  const { shop } = Route.useParams()
  return <NotFound title="This bag link is not here" body="Check the link for a typo, or ask the seller to send it again." href={`/${shop}`} action="See the shop" />
}

function BagPage() {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate()
  const { shop, areas } = parent.useLoaderData()
  const { bag } = Route.useLoaderData()

  useEffect(() => {
    // Opening a bag link is a visit to the shop.
    track('view_shop', { shopId: shop.id, detail: 'bag_link' })
  }, [shop.id])

  if (bag.state !== 'open') return <Ended shop={shop} bag={bag} />

  const problem = { gone: t('No longer in the shop'), size: t('This size is no longer offered'), stock: t('Sold out') }
  const lines: CheckoutLine[] = bag.lines.map((l, i) => ({
    key: String(i),
    productId: l.productId,
    name: l.name,
    image: l.image,
    size: l.size,
    option: l.option,
    qty: l.qty,
    price: l.price,
    left: null,
    problem: l.problem ? problem[l.problem] : null,
  }))
  const until = new Date(bag.expires_at).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Dar_es_Salaam',
  })

  return (
    <CheckoutView
      shop={shop}
      areas={areas}
      lines={lines}
      title={t('Your bag is ready')}
      intro={
        <>
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
            {t('{shop} made this bag for you. Add where to deliver and how you pay, and it is on its way.', { shop: shop.name })}
          </p>
          {bag.note && (
            <figure className="mt-4 max-w-[52ch] rounded-[16px] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <blockquote className="text-[15px] leading-relaxed whitespace-pre-line">“{bag.note}”</blockquote>
              <figcaption className="meta mt-1.5">{shop.name}</figcaption>
            </figure>
          )}
        </>
      }
      bagCode={bag.code}
      prefill={{ name: bag.name, phone: localPhone(bag.phone) }}
      blocked={bag.lines.some((l) => l.problem) ? t('Something in this bag is no longer available. Ask {shop} for a new link.', { shop: shop.name }) : undefined}
      foot={t('This link works once, until {date}.', { date: until })}
      onPlaced={async (code) => {
        await navigate({ to: '/o/$code', params: { code }, replace: true })
      }}
    />
  )
}

/** A bag link that was ordered, cancelled or ran out of time. */
function Ended({ shop, bag }: { shop: PublicShop; bag: PublicBag }) {
  const rise = useEntrance()
  const t = useT()
  const chat = (text: string) =>
    shop.whatsapp ? (
      <a href={waLink(shop.whatsapp, text)} target="_blank" rel="noreferrer" className="btn" onClick={() => track('whatsapp_click', { shopId: shop.id, detail: 'order' })}>
        <WhatsAppMark size={20} /> {t('Message {shop} on WhatsApp', { shop: shop.name })}
      </a>
    ) : null
  const toShop = (
    <Link to="/$shop" params={{ shop: shop.slug }} className="text-[14px] font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
      {t('See {shop}', { shop: shop.name })}
    </Link>
  )
  const copy: Record<Exclude<PublicBag['state'], 'open'>, { title: string; body: string; action: ReactNode }> = {
    used: {
      title: t('This bag has been ordered'),
      body: t('An order was placed from this link. Follow it, pay or message the seller from the order page.'),
      action: bag.order_code ? (
        <Link to="/o/$code" params={{ code: bag.order_code }} className="btn">
          {t('See the order')}
        </Link>
      ) : null,
    },
    expired: {
      title: t('This bag link has ended'),
      body: t('Bag links from {shop} work for 7 days. Ask for a new one on WhatsApp.', { shop: shop.name }),
      action: chat(t('Hi {shop}, my bag link ({code}) has ended. Can you send me a new one?', { shop: shop.name, code: bag.code })),
    },
    cancelled: {
      title: t('{shop} cancelled this bag', { shop: shop.name }),
      body: t('Message the seller on WhatsApp if you still want it.'),
      action: chat(t('Hi {shop}, I opened my bag link ({code}). Is it still available?', { shop: shop.name, code: bag.code })),
    },
  }
  const c = copy[bag.state as Exclude<PublicBag['state'], 'open'>]
  return (
    <div className="min-h-dvh bg-page">
      <CheckoutHeader shop={shop} />
      <main className="mx-auto max-w-[560px] px-4 pt-8 pb-16 md:pt-16">
        <section className={`${rise} card flex flex-col items-center p-6 text-center md:p-10`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-well text-ink-2">
            <ShoppingBag size={20} strokeWidth={1.5} />
          </span>
          <h1 className="title mt-5 text-[24px] md:text-[30px]">{c.title}</h1>
          <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-muted">{c.body}</p>
          <div className="mt-7 flex flex-col items-center gap-4">
            {c.action}
            {toShop}
          </div>
        </section>
        {shop.badge && <MadeWithShopi shopSlug={shop.slug} />}
      </main>
    </div>
  )
}
