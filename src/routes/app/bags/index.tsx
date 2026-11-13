import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus, ShoppingBag } from 'lucide-react'
import { BagPill, useEndsIn } from '#/components/bag-links'
import { Chips, Empty, Img, Page, TopBar } from '#/components/ui'
import { listBagLinks, type BagSummary } from '#/lib/api/bags'
import { timeAgo, tzs } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'

const FILTERS = ['open', 'used', 'ended'] as const
type Filter = (typeof FILTERS)[number]

export const Route = createFileRoute('/app/bags/')({
  validateSearch: (s: Record<string, unknown>): { f?: Filter } => ({ f: FILTERS.includes(s.f as Filter) ? (s.f as Filter) : undefined }),
  loader: () => listBagLinks(),
  head: () => ({ meta: [{ title: 'Bag links · Shopi' }] }),
  component: BagLinks,
})

const MATCH: Record<Filter, (b: BagSummary) => boolean> = {
  open: (b) => b.state === 'open',
  used: (b) => b.state === 'used',
  ended: (b) => b.state === 'expired' || b.state === 'cancelled',
}

function BagLinks() {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate({ from: '/app/bags/' })
  const bags = Route.useLoaderData()
  const filter = Route.useSearch().f ?? 'open'
  const endsIn = useEndsIn()
  const count = (f: Filter) => bags.filter(MATCH[f]).length
  const shown = bags.filter(MATCH[filter])
  const when = (b: BagSummary) => (b.state === 'open' ? endsIn(b.expires_at) : timeAgo(b.used_at ?? b.created_at, lang))

  return (
    <Page nav wide>
      <TopBar
        back="/app/orders"
        title={t('Bag links')}
        sub={count('open') ? t(count('open') === 1 ? '{n} waiting for a buyer' : '{n} waiting for buyers', { n: count('open') }) : t('A bag you build for one buyer, sent as one link')}
        right={
          <Link to="/app/bags/new" className="btn btn-sm">
            <Plus size={15} strokeWidth={2} /> {t('New bag link')}
          </Link>
        }
      />

      {bags.length > 0 && (
        <Chips
          value={filter}
          onChange={(f) => navigate({ search: { f: f === 'open' ? undefined : f }, replace: true })}
          options={[
            { id: 'open', label: t('Open'), count: count('open') },
            { id: 'used', label: t('Ordered'), count: count('used') },
            { id: 'ended', label: t('Ended') },
          ]}
        />
      )}

      <div className="mt-5">
        {shown.length === 0 ? (
          <Empty
            icon={<ShoppingBag size={20} strokeWidth={1.5} />}
            title={filter === 'open' ? t('No open bag links') : filter === 'used' ? t('No bag links ordered yet') : t('Nothing here')}
            body={
              filter === 'open'
                ? t('Agreed an order in a chat? Put it in a bag and send one link. The buyer adds where to deliver and pays you.')
                : undefined
            }
            action={
              filter === 'open' ? (
                <Link to="/app/bags/new" className="btn btn-sm">
                  <Plus size={15} strokeWidth={2} /> {t('New bag link')}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {shown.map((b) => (
              <Link
                key={b.id}
                to="/app/bags/$id"
                params={{ id: b.id }}
                className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 px-5 py-3.5 transition-colors hover:bg-page lg:grid-cols-[44px_minmax(0,1.4fr)_100px_140px_minmax(0,1fr)_120px] lg:gap-x-6 lg:px-6"
              >
                <Img size="thumb" k={b.image} alt="" className="h-11 w-11 rounded-[10px]" />
                {/* Phone: who and how much, then where it stands */}
                <div className="min-w-0 lg:hidden">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-medium">{b.name || t('Bag link')}</p>
                    <p className="tnum shrink-0 text-[15px] font-medium">{tzs(b.total)}</p>
                  </div>
                  <div className="mt-0.5 flex h-6 items-center gap-3">
                    <BagPill state={b.state} />
                    <p className="min-w-0 flex-1 truncate text-[13px] text-muted">{t(b.count === 1 ? '{n} item' : '{n} items', { n: b.count })}</p>
                    <p className="meta shrink-0">{when(b)}</p>
                  </div>
                </div>
                {/* Desktop: a table row */}
                <div className="hidden min-w-0 lg:block">
                  <p className="truncate text-[14px] font-medium">{b.name || t('Bag link')}</p>
                  <p className="meta mt-0.5 truncate">{b.phone || b.code}</p>
                </div>
                <p className="hidden text-[14px] text-ink-2 lg:block">{t(b.count === 1 ? '{n} item' : '{n} items', { n: b.count })}</p>
                <p className="tnum hidden text-right text-[14px] font-medium lg:block">{tzs(b.total)}</p>
                <div className="hidden lg:block">
                  <BagPill state={b.state} />
                </div>
                <p className="meta hidden text-right lg:block">{b.state === 'used' && b.order_code ? `#${b.order_code}` : when(b)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}
