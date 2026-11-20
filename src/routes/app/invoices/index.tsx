import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { BookUser, ChevronRight, FilePlus2, FileText, Settings2 } from 'lucide-react'
import { Chips, Empty, InvoicePill, Notice, Page, TopBar } from '#/components/ui'
import { getInvoices, type InvoiceListRow } from '#/lib/api/invoices'
import { useLang, useT } from '#/lib/i18n'
import { clientTitle, displayNumber, docDate, money } from '#/lib/invoice'
import { allows } from '#/lib/staff'

/**
 * Invoices and quotes (roadmap `v-invoices`): what is owed to the business, proofs of payment to check, and every
 * document, newest first. "Owed" lists the unpaid invoices oldest first, the order to chase them in.
 */

type Tab = 'invoice' | 'quote'
type Filter = 'all' | 'owed' | 'paid' | 'draft'

export const Route = createFileRoute('/app/invoices/')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; show?: Filter } => ({
    tab: s.tab === 'quote' ? 'quote' : undefined,
    show: s.show === 'owed' || s.show === 'paid' || s.show === 'draft' ? s.show : undefined,
  }),
  loader: () => getInvoices(),
  head: () => ({ meta: [{ title: 'Invoices · Shopi' }] }),
  component: Invoices,
})

function Invoices() {
  const t = useT()
  const data = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const tab: Tab = search.tab ?? 'invoice'
  const show: Filter = search.show ?? 'all'
  const mine = data.invoices.filter((i) => i.kind === tab)
  const quotes = data.invoices.filter((i) => i.kind === 'quote')
  // Sent and not fully paid: what the business is waiting for.
  const owing = mine.filter((i) => i.kind === 'invoice' && ['sent', 'viewed', 'part', 'overdue'].includes(i.state))
  const rows =
    show === 'owed'
      ? [...owing].sort((a, b) => (a.due_day ?? a.issue_day).localeCompare(b.due_day ?? b.issue_day))
      : show === 'paid'
        ? mine.filter((i) => i.state === 'paid' || i.state === 'invoiced' || i.state === 'accepted')
        : show === 'draft'
          ? mine.filter((i) => i.state === 'draft')
          : mine
  const owedText = data.owed.map((o) => money(o.cents, o.currency)).join(' + ')
  const newOne = (
    <Link to="/app/invoices/new" search={tab === 'quote' ? { kind: 'quote' } : {}} className="btn btn-sm h-10">
      <FilePlus2 size={16} strokeWidth={1.75} /> {tab === 'quote' ? t('New quote') : t('New invoice')}
    </Link>
  )

  return (
    <Page nav wide>
      <TopBar
        title={t('Invoices')}
        sub={owedText ? t('{amount} owed to you', { amount: owedText }) : t('Bill clients and see when they pay')}
        right={
          <>
            <Link to="/app/clients" className="btn btn-ghost btn-sm h-10 w-10 px-0 md:w-auto md:px-[14px]" aria-label={t('Clients')}>
              <BookUser size={16} strokeWidth={1.75} /> <span className="hidden md:inline">{t('Clients')}</span>
            </Link>
            {allows(shop.role, 'owner') && (
              <Link to="/app/invoices/settings" className="btn btn-ghost btn-sm h-10 w-10 px-0" aria-label={t('Invoice settings')}>
                <Settings2 size={16} strokeWidth={1.75} />
              </Link>
            )}
            {data.invoices.length > 0 && newOne}
          </>
        }
      />

      <div className="space-y-3 md:space-y-4">
        {data.checks > 0 && (
          <Notice
            signal
            icon={<FileText size={18} strokeWidth={1.75} />}
            title={t(data.checks === 1 ? '{n} payment to check' : '{n} payments to check', { n: data.checks })}
            sub={t('A client sent the payment SMS. Confirm it once the money is in.')}
            onClick={() => navigate({ search: { show: 'owed' } })}
          />
        )}
        {!data.settings && allows(shop.role, 'owner') && (
          <Notice
            icon={<Settings2 size={18} strokeWidth={1.75} />}
            title={t('Add your details for invoices')}
            sub={t('Your address, TIN, bank account and payment terms, printed on every invoice.')}
            to="/app/invoices/settings"
          />
        )}

        {data.invoices.length === 0 ? (
          <Empty
            icon={<FileText size={20} strokeWidth={1.75} />}
            title={t('No invoices yet')}
            body={t('Write an invoice or a quote, send it on WhatsApp as a link and a PDF, and see when your client opens it and pays.')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/app/invoices/new" className="btn btn-sm h-10">
                  <FilePlus2 size={16} strokeWidth={1.75} /> {t('New invoice')}
                </Link>
                <Link to="/app/invoices/new" search={{ kind: 'quote' }} className="btn btn-ghost btn-sm h-10">
                  {t('New quote')}
                </Link>
              </div>
            }
          />
        ) : (
          <>
            <Chips
              value={tab}
              onChange={(v) => navigate({ search: v === 'quote' ? { tab: 'quote' } : {} })}
              options={[
                { id: 'invoice', label: t('Invoices'), count: data.invoices.length - quotes.length },
                { id: 'quote', label: t('Quotes'), count: quotes.length },
              ]}
            />
            <Chips
              value={show}
              onChange={(v) => navigate({ search: { ...(tab === 'quote' ? { tab } : {}), ...(v === 'all' ? {} : { show: v }) } })}
              options={[
                { id: 'all', label: t('All') },
                ...(tab === 'invoice' ? [{ id: 'owed' as const, label: t('Owed'), count: owing.length }] : []),
                { id: 'paid', label: tab === 'quote' ? t('Accepted') : t('Paid') },
                { id: 'draft', label: t('Drafts') },
              ]}
            />
            {rows.length === 0 ? (
              <p className="rounded-14 bg-card px-4 py-8 text-center text-14 text-muted">{t('Nothing here.')}</p>
            ) : (
              <section className="card overflow-hidden">
                <ul className="divide-y divide-line">
                  {rows.map((i) => (
                    <Row key={i.id} i={i} today={data.today} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Page>
  )
}

/** Two lines (DESIGN.md, lists on phones): who and how much; then the state, the number and the date. */
function Row({ i, today }: { i: InvoiceListRow; today: string }) {
  const t = useT()
  const lang = useLang()
  const balance = Math.max(0, i.total - i.paid)
  const shownAmount = i.kind === 'invoice' && i.paid > 0 && balance > 0 ? balance : i.total
  const date = i.kind === 'invoice' && i.due_day && balance > 0 && i.state !== 'draft' && i.state !== 'cancelled'
    ? i.due_day < today
      ? t('Was due {date}', { date: docDate(i.due_day, lang) })
      : t('Due {date}', { date: docDate(i.due_day, lang) })
    : docDate(i.issue_day, lang)
  return (
    <li>
      <Link to="/app/invoices/$id" params={{ id: i.id }} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-page md:px-6">
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-15 font-medium">{clientTitle(i.client, t)}</span>
            <span className={`tnum shrink-0 text-15 ${i.state === 'cancelled' ? 'text-muted line-through' : ''}`}>{money(shownAmount, i.currency)}</span>
          </span>
          <span className="mt-1 flex items-center gap-2">
            <InvoicePill state={i.state} check={i.checks > 0} />
            <span className="code min-w-0 truncate text-12 text-muted">{displayNumber(i.kind, i.number)}</span>
            <span className="meta ml-auto shrink-0">{date}</span>
          </span>
        </span>
        <ChevronRight size={16} strokeWidth={1.75} className="hidden shrink-0 text-faint md:block" />
      </Link>
    </li>
  )
}
