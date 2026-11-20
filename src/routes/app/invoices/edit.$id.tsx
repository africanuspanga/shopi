import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { InvoiceForm } from '#/components/invoice-form'
import { Page, TopBar } from '#/components/ui'
import { getInvoiceEditor } from '#/lib/api/invoices'
import { displayNumber } from '#/lib/invoice'
import { useT } from '#/lib/i18n'

/** Changing an invoice or quote after it was saved (roadmap `v-invoices`). Payments already made stay. */
export const Route = createFileRoute('/app/invoices/edit/$id')({
  loader: async ({ params }) => {
    const data = await getInvoiceEditor({ data: { id: params.id } })
    if (!data?.invoice) throw notFound()
    return data
  },
  head: () => ({ meta: [{ title: 'Edit invoice · Shopi' }] }),
  component: EditInvoice,
})

function EditInvoice() {
  const t = useT()
  const data = Route.useLoaderData()
  const navigate = useNavigate()
  const inv = data.invoice!
  return (
    <Page wide>
      <TopBar title={t('Edit {number}', { number: displayNumber(inv.kind, inv.number) })} back={`/app/invoices/${inv.id}`} />
      <InvoiceForm data={data} kind={inv.kind} onSaved={(id) => navigate({ to: '/app/invoices/$id', params: { id } })} />
    </Page>
  )
}
