import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { CalendarClock, ChevronRight, Clock, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ServiceForm, serviceMeta } from '#/components/booking'
import { Card, Empty, Img, Notice, Page, Sheet, TopBar } from '#/components/ui'
import { getMyServices, setShopKind, type MyService } from '#/lib/api/services'
import { hoursLine, servicePrice } from '#/lib/booking'
import { useLang, useT } from '#/lib/i18n'
import { allows } from '#/lib/staff'

/**
 * Services (roadmap `v-services`): what clients can book on the shop's link. A service is a name, how long it takes
 * and a price; clients can book once the business has also set its working hours (/app/hours).
 */
export const Route = createFileRoute('/app/services')({
  // From the + sheet: the page opens with "New service" up.
  validateSearch: (s: Record<string, unknown>): { add?: 1 } => ({ add: s.add ? 1 : undefined }),
  loader: () => getMyServices(),
  head: () => ({ meta: [{ title: 'Services · Shopi' }] }),
  component: Services,
})

function Services() {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const { services, book, kind } = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const manages = allows(shop.role, 'manage')
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [editing, setEditing] = useState<MyService | 'new' | null>(search.add ? 'new' : null)
  useEffect(() => {
    if (!search.add) return
    setEditing('new')
    navigate({ search: {}, replace: true })
  }, [search.add, navigate])
  const live = services.filter((s) => s.active).length
  const add = (
    <button type="button" className="btn btn-sm h-10" onClick={() => setEditing('new')}>
      <Plus size={16} strokeWidth={2.25} /> {t('Add service')}
    </button>
  )

  return (
    <Page nav wide>
      <TopBar
        title={t('Services')}
        sub={services.length ? t(live === 1 ? '{n} service clients can book' : '{n} services clients can book', { n: live }) : t('What clients book on your link')}
        right={
          <>
            {manages && (
              <Link to="/app/hours" className="btn btn-ghost btn-sm h-10 w-10 px-0 md:w-auto md:px-[14px]" aria-label={t('Working hours')}>
                <Clock size={16} strokeWidth={1.75} /> <span className="hidden md:inline">{t('Working hours')}</span>
              </Link>
            )}
            {services.length > 0 && add}
          </>
        }
      />

      {kind === 'services' && (
        <Link to="/app/products" className="-mt-2 mb-4 flex w-fit items-center gap-1 text-14 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 md:hidden">
          {t('Products')} <ChevronRight size={14} strokeWidth={1.75} />
        </Link>
      )}
      {services.length === 0 ? (
        <Empty
          icon={<CalendarClock size={20} strokeWidth={1.75} />}
          title={t('No services yet')}
          body={t('Add what clients can book: a haircut, braids, a massage, a consultation. They pick a free time on your link.')}
          action={add}
        />
      ) : (
        <div className="space-y-3 md:space-y-4">
          {!book ? (
            <Notice
              signal
              icon={<Clock size={18} strokeWidth={1.75} />}
              title={t('Set your working hours')}
              sub={manages ? t('Clients can book once you say which days and hours you work.') : t('Clients can book once the shop’s owner sets the working hours.')}
              to={manages ? '/app/hours' : undefined}
            />
          ) : (
            <Notice
              icon={<Clock size={18} strokeWidth={1.75} />}
              title={hoursLine(t, lang, book.days)}
              sub={[
                t(book.seats === 1 ? '{n} client at a time' : '{n} clients at a time', { n: book.seats }),
                book.confirm ? t('You confirm each booking') : t('Bookings are confirmed at once'),
              ].join(' · ')}
              to={manages ? '/app/hours' : undefined}
            />
          )}

          <section className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {services.map((s) => (
                <li key={s.id}>
                  <button type="button" className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-page md:px-6" onClick={() => setEditing(s)}>
                    {s.images[0] && <Img k={s.images[0]} size="thumb" alt="" className={`h-14 w-14 shrink-0 rounded-12 ${s.active ? '' : 'opacity-50'}`} />}
                    <span className="min-w-0 flex-1">
                      <span className={`line-clamp-2 text-15 leading-5 font-medium ${s.active ? '' : 'text-muted'}`}>{s.name}</span>
                      <span className="mt-0.5 block truncate text-13 text-muted">
                        {[serviceMeta(t, s), s.active ? '' : t('Hidden')].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {!!s.price && <span className="tnum block text-14 text-ink-2">{servicePrice(t, s)}</span>}
                      {s.upcoming > 0 && <span className="meta block">{t(s.upcoming === 1 ? '{n} booking coming' : '{n} bookings coming', { n: s.upcoming })}</span>}
                    </span>
                    <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* A business that sends invoices leads with them; its link's order isn't a products-or-services choice. */}
          {manages && kind !== 'invoices' && <FirstPage kind={kind} onChange={() => router.invalidate()} />}
        </div>
      )}

      {editing && (
        <Sheet open onClose={() => setEditing(null)} title={editing === 'new' ? t('New service') : t('Edit service')}>
          <ServiceForm
            key={editing === 'new' ? 'new' : editing.id}
            service={editing === 'new' ? null : editing}
            onSaved={async () => {
              await router.invalidate()
              setEditing(null)
            }}
          />
        </Sheet>
      )}
    </Page>
  )
}

/** A shop may hold products and services: which one its link opens with. */
function FirstPage({ kind, onChange }: { kind: 'products' | 'services'; onChange: () => void }) {
  const t = useT()
  const [value, setValue] = useState(kind)
  return (
    <Card title={t('What your link shows first')} sub={t('A shop can hold services and products. Clients see this one at the top.')}>
        <div className="mt-4 flex gap-2" role="radiogroup" aria-label={t('What your link shows first')}>
          {(
            [
              ['services', t('Services')],
              ['products', t('Products')],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={value === id}
              aria-pressed={value === id}
              className="chip"
              onClick={async () => {
                setValue(id)
                await setShopKind({ data: { kind: id } })
                onChange()
              }}
            >
              {label}
            </button>
          ))}
        </div>
    </Card>
  )
}
