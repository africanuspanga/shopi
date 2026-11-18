import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { BagPill, useEndsIn } from '#/components/bag-links'
import { ShareActions, prettyUrl } from '#/components/share'
import { Img, Page, TopBar } from '#/components/ui'
import { cancelBagLink, getMyBagLink } from '#/lib/api/bags'
import { track } from '#/lib/analytics'
import { optionText, timeAgo, tzs } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'

export const Route = createFileRoute('/app/bags/$id')({
  validateSearch: (s: Record<string, unknown>): { made?: boolean } => ({ made: s.made === true || s.made === 'true' ? true : undefined }),
  loader: async ({ params }) => {
    const bag = await getMyBagLink({ data: { id: params.id } })
    if (!bag) throw notFound()
    return bag
  },
  head: () => ({ meta: [{ title: 'Bag link · Shopi' }] }),
  component: BagDetail,
})

function BagDetail() {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const b = Route.useLoaderData()
  const { made } = Route.useSearch()
  const { shop } = Route.useRouteContext()
  const endsIn = useEndsIn()
  const [busy, setBusy] = useState(false)
  const url = `${useOrigin()}/${shop.slug}/b/${b.code}`
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Dar_es_Salaam' })
  const problem = { gone: t('No longer in your shop'), size: t('This size is no longer offered'), stock: t('Not enough in stock') }
  const blocked = b.state === 'open' && b.lines.some((l) => l.problem)
  const when = {
    open: endsIn(b.expires_at),
    used: timeAgo(b.used_at ?? b.created_at, lang),
    expired: date(b.expires_at),
    cancelled: '',
  }[b.state]
  const message = b.name
    ? t('Hi {name}, here is your bag from {shop}: {items}, {total}. Add where to deliver and pay here:', {
        name: b.name,
        shop: shop.name,
        items: t(b.count === 1 ? '{n} item' : '{n} items', { n: b.count }),
        total: tzs(b.total),
      })
    : t('Hi, here is your bag from {shop}: {items}, {total}. Add where to deliver and pay here:', {
        shop: shop.name,
        items: t(b.count === 1 ? '{n} item' : '{n} items', { n: b.count }),
        total: tzs(b.total),
      })

  async function cancel() {
    if (!window.confirm(t('Cancel this bag link? The buyer will see that it is cancelled.'))) return
    setBusy(true)
    await cancelBagLink({ data: { id: b.id } })
    await router.invalidate()
    setBusy(false)
  }

  return (
    <Page nav wide>
      <TopBar
        back="/app/bags"
        title={b.name ? t('Bag for {name}', { name: b.name }) : t('Bag link')}
        sub={
          <span className="flex items-center gap-2">
            <BagPill state={b.state} />
            {when && <span aria-hidden>·</span>}
            {when}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className="space-y-4 lg:sticky lg:top-8 lg:order-2">
          {b.state === 'open' && (
            <section className={`card p-6 ${made ? 'rise' : ''}`}>
              <h2 className="text-17 font-semibold">{made ? t('Your bag link is ready') : t('Send the link')}</h2>
              <p className="mt-1.5 text-14 leading-relaxed text-muted">
                {b.phone
                  ? t('WhatsApp opens your chat with {who}. The link works once, until {date}.', { who: b.name || b.phone, date: date(b.expires_at) })
                  : t('Send it in your chat with the buyer. The link works once, until {date}.', { date: date(b.expires_at) })}
              </p>
              <p className="code mt-4 truncate rounded-12 bg-page px-3.5 py-3 text-13 text-ink-2">{prettyUrl(url)}</p>
              <div className="mt-3">
                <ShareActions url={url} text={message} title={t('Your bag from {shop}', { shop: shop.name })} phone={b.phone || undefined} onShared={(how) => track('seller_share', { shopId: shop.id, detail: `bag-${how}` })} />
              </div>
              {blocked && <p className="mt-4 rounded-14 bg-moto-soft px-4 py-3 text-14 text-moto-ink">{t('Something in this bag can no longer be ordered. Cancel this link and make a new one.')}</p>}
            </section>
          )}
          {b.state === 'used' && b.order_id && (
            <section className="card p-6">
              <h2 className="text-17 font-semibold">{t('The buyer ordered this bag')}</h2>
              <p className="mt-1.5 text-14 leading-relaxed text-muted">{t('It is order #{code}. Check the payment and send it from there.', { code: b.order_code ?? '' })}</p>
              <Link to="/app/orders/$id" params={{ id: b.order_id }} className="btn mt-5 w-full">
                {t('Open the order')} <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </section>
          )}
          {(b.state === 'expired' || b.state === 'cancelled') && (
            <section className="card p-6">
              <h2 className="text-17 font-semibold">{b.state === 'expired' ? t('This link has ended') : t('You cancelled this link')}</h2>
              <p className="mt-1.5 text-14 leading-relaxed text-muted">{t('The buyer can no longer order from it. Make a new bag link if they still want it.')}</p>
              <Link to="/app/bags/new" className="btn btn-ghost mt-5 w-full">
                <Plus size={16} strokeWidth={2.25} /> {t('New bag link')}
              </Link>
            </section>
          )}

          {(b.name || b.phone || b.note) && (
            <section className="card p-6">
              <p className="text-13 text-muted">{t('For')}</p>
              {b.name && <p className="mt-1 text-17 font-semibold">{b.name}</p>}
              {b.phone && <p className="code mt-0.5 text-14 text-ink-2">{b.phone}</p>}
              {b.note && <p className="mt-4 rounded-14 bg-page px-4 py-3 text-14 leading-relaxed text-ink-2">“{b.note}”</p>}
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-4 lg:order-1">
          <div className="receipt px-6 pt-6 pb-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-15 font-semibold">{t('In the bag')}</h2>
              <p className="meta">{t('Made {date}', { date: date(b.created_at) })}</p>
            </div>
            <div className="mt-4 space-y-4">
              {b.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Img size="thumb" k={l.image} alt={l.name} className={`h-16 w-14 shrink-0 rounded-12 ${l.problem ? 'opacity-50' : ''}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-15 font-medium">{l.name}</p>
                    <p className="mt-0.5 text-13 text-muted">
                      {l.size && (
                        <>
                          <span className="font-medium text-ink">{optionText(t, l.option, l.size)}</span>
                          {' · '}
                        </>
                      )}
                      {l.qty} × <span className="tnum">{tzs(l.price)}</span>
                    </p>
                    {b.state === 'open' && l.problem && <p className="mt-0.5 text-13 text-moto-ink">{problem[l.problem]}</p>}
                  </div>
                  <p className="font-mono text-14">{tzs(l.qty * l.price)}</p>
                </div>
              ))}
            </div>
            <div className="receipt-rule mt-6 space-y-2 pt-4 text-14">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-ink-2">{t('Delivery')}</span>
                <span className="font-mono text-13">{t('Agree on WhatsApp')}</span>
              </div>
            </div>
            <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
              <span className="text-15 font-medium">{t('Total')}</span>
              <span className="font-mono text-20 font-medium tracking-tight">{tzs(b.total)}</span>
            </div>
          </div>

          {b.state === 'open' && (
            <button type="button" disabled={busy} className="btn w-full bg-transparent text-bad hover:bg-bad/[0.06] lg:w-auto" onClick={cancel}>
              {t('Cancel this bag link')}
            </button>
          )}
        </div>
      </div>
    </Page>
  )
}
