import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ReceiptText, Search } from 'lucide-react'
import { useState } from 'react'
import { Chips, Empty, Page, StatusPill, TopBar } from '#/components/ui'
import { listOrders } from '#/lib/api/merchant'
import { timeAgo, tzs, type OrderStatus } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'

const FILTERS = ['todo', 'check', 'send', 'way', 'done', 'cancelled', 'all'] as const
type Filter = (typeof FILTERS)[number]

export const Route = createFileRoute('/app/orders/')({
  validateSearch: (s: Record<string, unknown>): { f?: Filter } => ({
    f: FILTERS.includes(s.f as Filter) ? (s.f as Filter) : undefined,
  }),
  loader: () => listOrders(),
  component: Orders,
})

const OPEN: OrderStatus[] = ['awaiting_payment', 'payment_claimed', 'confirmed', 'dispatched']
const MATCH: Record<Filter, (s: OrderStatus) => boolean> = {
  todo: (s) => OPEN.includes(s),
  check: (s) => s === 'payment_claimed',
  send: (s) => s === 'confirmed',
  way: (s) => s === 'dispatched',
  done: (s) => s === 'delivered',
  cancelled: (s) => s === 'cancelled',
  all: () => true,
}

function Orders() {
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate({ from: '/app/orders/' })
  const orders = Route.useLoaderData()
  const filter = Route.useSearch().f ?? 'todo'
  const [q, setQ] = useState('')
  const count = (f: Filter) => orders.filter((o) => MATCH[f](o.status)).length
  const needle = q.trim().toLowerCase()
  const shown = orders.filter(
    (o) =>
      MATCH[filter](o.status) &&
      (!needle || [o.customer_name, o.customer_phone, o.code, o.area].some((v) => v.toLowerCase().includes(needle))),
  )

  return (
    <Page nav wide>
      <TopBar
        title={t('Orders')}
        sub={count('todo') ? t('{n} open', { n: count('todo') }) : t('All caught up')}
        right={
          <label className="input hidden h-10 w-64 items-center gap-2 px-3 md:flex">
            <Search size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
            <input className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" placeholder={t('Search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        }
      />

      <label className="input mb-4 flex items-center gap-2 px-3 md:hidden">
        <Search size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
        <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t('Search name, phone or order')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      <Chips
        value={filter}
        onChange={(f) => navigate({ search: { f: f === 'todo' ? undefined : f }, replace: true })}
        options={[
          { id: 'todo', label: t('Open'), count: count('todo') },
          ...(count('check') ? [{ id: 'check' as const, label: t('Check payment'), count: count('check') }] : []),
          { id: 'send', label: t('To send'), count: count('send') },
          { id: 'way', label: t('On the way'), count: count('way') },
          { id: 'done', label: t('Delivered') },
          { id: 'cancelled', label: t('Cancelled') },
          { id: 'all', label: t('All') },
        ]}
      />

      <div className="mt-5">
        {shown.length === 0 ? (
          <Empty
            icon={<ReceiptText size={20} strokeWidth={1.5} />}
            title={needle ? t('No orders match') : filter === 'todo' ? t('Nothing to do right now') : t('No orders here')}
            body={needle ? t('Try a name, a phone number or an order code.') : filter === 'todo' ? t('New orders show up here the moment a buyer places them.') : undefined}
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1fr)_70px_90px_130px_130px] gap-x-6 border-b border-line px-6 py-3 text-[13px] text-muted lg:grid">
              <span>{t('Order')}</span>
              <span>{t('Customer')}</span>
              <span>{t('Delivery')}</span>
              <span>{t('Items')}</span>
              <span>{t('Payment')}</span>
              <span className="text-right">{t('Total')}</span>
              <span>{t('Status')}</span>
            </div>
            <div className="divide-y divide-line">
              {shown.map((o) => (
                <Link
                  key={o.id}
                  to="/app/orders/$id"
                  params={{ id: o.id }}
                  className="block px-5 py-4 transition-colors hover:bg-page lg:grid lg:grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1fr)_70px_90px_130px_130px] lg:items-center lg:gap-x-6 lg:px-6 lg:py-3.5"
                >
                  {/* Phone: two lines. Desktop: a table row. */}
                  <div className="flex items-start justify-between gap-4 lg:contents">
                    <div className="min-w-0 lg:order-2">
                      <p className="truncate text-[15px] font-medium lg:text-[14px]">{o.customer_name}</p>
                      <p className="mt-0.5 truncate text-[13px] text-muted lg:hidden">
                        <span className="code">#{o.code}</span> · {timeAgo(o.created_at, lang)} · {o.area || t('No area')}
                      </p>
                      <p className="meta mt-0.5 hidden lg:block">{o.customer_phone}</p>
                    </div>
                    <div className="shrink-0 text-right lg:order-6">
                      <p className="tnum text-[15px] font-medium lg:text-[14px]">{tzs(o.total)}</p>
                      <p className="mt-1 lg:hidden">
                        <StatusPill status={o.status} />
                      </p>
                    </div>
                  </div>
                  <div className="hidden lg:order-1 lg:block">
                    <p className="code text-[13px]">#{o.code}</p>
                    <p className="meta mt-0.5">{timeAgo(o.created_at, lang)}</p>
                  </div>
                  <p className="hidden truncate text-[14px] text-ink-2 lg:order-3 lg:block">{o.area || '—'}</p>
                  <p className="tnum hidden text-[14px] text-ink-2 lg:order-4 lg:block">{o.items}</p>
                  <p className="hidden text-[14px] text-ink-2 lg:order-5 lg:block">{o.payment_method === 'cod' ? t('Cash') : 'Lipa'}</p>
                  <div className="hidden lg:order-7 lg:block">
                    <StatusPill status={o.status} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Page>
  )
}
