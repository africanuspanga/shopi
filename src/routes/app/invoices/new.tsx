import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { InvoiceForm } from '#/components/invoice-form'
import { Page, TopBar } from '#/components/ui'
import { getInvoiceEditor } from '#/lib/api/invoices'
import { useT } from '#/lib/i18n'

/**
 * A new invoice or quote (roadmap `v-invoices`). `?kind=quote` for a quote; `?order=` or `?booking=` starts from an
 * order or a booking (its lines and its client); `?client=` from a client in the list.
 */
type Search = { kind?: 'quote'; order?: string; booking?: string; client?: string }

export const Route = createFileRoute('/app/invoices/new')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    kind: s.kind === 'quote' ? 'quote' : undefined,
    order: typeof s.order === 'string' ? s.order : undefined,
    booking: typeof s.booking === 'string' ? s.booking : undefined,
    client: typeof s.client === 'string' ? s.client : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getInvoiceEditor({ data: { kind: deps.kind, order: deps.order, booking: deps.booking, client: deps.client } }),
  head: () => ({ meta: [{ title: 'New invoice · Shopi' }] }),
  component: NewInvoice,
})

function NewInvoice() {
  const t = useT()
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const kind = search.kind === 'quote' ? 'quote' : 'invoice'
  if (!data) return null
  return (
    <Page wide>
      <TopBar title={kind === 'quote' ? t('New quote') : t('New invoice')} back="/app/invoices" />
      <InvoiceForm data={data} kind={kind} onSaved={(id) => navigate({ to: '/app/invoices/$id', params: { id } })} />
    </Page>
  )
}
