import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { BookUser, ChevronRight, FilePlus2, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Empty, ErrorText, Field, Page, Sheet, TopBar } from '#/components/ui'
import { deleteClient, getClients, saveClient, type ClientListRow } from '#/lib/api/invoices'
import { useT } from '#/lib/i18n'
import { EMPTY_CLIENT, money, type InvoiceClient } from '#/lib/invoice'

/**
 * Clients (roadmap `v-invoices`): the people and companies the business bills, with what each still owes. A client is
 * kept automatically when an invoice is saved; here they can be added, changed or removed. Invoices keep their own copy.
 */
export const Route = createFileRoute('/app/clients')({
  loader: () => getClients(),
  head: () => ({ meta: [{ title: 'Clients · Shopi' }] }),
  component: Clients,
})

function Clients() {
  const t = useT()
  const { clients } = Route.useLoaderData()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ClientListRow | 'new' | null>(null)
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? clients.filter((c) => `${c.name} ${c.company} ${c.phone} ${c.email}`.toLowerCase().includes(n)) : clients
  }, [q, clients])
  const add = (
    <button type="button" className="btn btn-sm h-10" onClick={() => setEditing('new')}>
      <Plus size={16} strokeWidth={2.25} /> {t('Add client')}
    </button>
  )
  return (
    <Page nav wide>
      <TopBar title={t('Clients')} sub={t('Who you bill, and what they still owe')} back="/app/invoices" right={clients.length > 0 && add} />
      {clients.length === 0 ? (
        <Empty
          icon={<BookUser size={20} strokeWidth={1.75} />}
          title={t('No clients yet')}
          body={t('Clients are kept here when you save an invoice for them. You can add one now too.')}
          action={add}
        />
      ) : (
        <div className="space-y-3">
          {clients.length > 8 && (
            <label className="input flex items-center gap-2 bg-card px-4">
              <Search size={16} strokeWidth={1.75} className="text-muted" />
              <input className="min-w-0 flex-1 bg-transparent outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search clients')} aria-label={t('Search clients')} />
            </label>
          )}
          <section className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {shown.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-page md:px-6" onClick={() => setEditing(c)}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-15 font-medium">{c.company || c.name}</span>
                        {c.owed.length > 0 && <span className="tnum shrink-0 text-15">{c.owed.map((o) => money(o.cents, o.currency)).join(' + ')}</span>}
                      </span>
                      <span className="mt-0.5 flex items-baseline justify-between gap-3 text-13 text-muted">
                        <span className="truncate">{[c.company ? c.name : '', c.phone].filter(Boolean).join(' · ') || '—'}</span>
                        <span className="meta shrink-0">
                          {c.owed.length > 0 ? `${t('owed')} · ` : ''}
                          {t(c.invoices === 1 ? '{n} invoice' : '{n} invoices', { n: c.invoices })}
                        </span>
                      </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {editing && (
        <Sheet open onClose={() => setEditing(null)} title={editing === 'new' ? t('New client') : editing.company || editing.name}>
          <ClientForm
            client={editing === 'new' ? null : editing}
            onDone={async () => {
              await router.invalidate()
              setEditing(null)
            }}
          />
        </Sheet>
      )}
    </Page>
  )
}

function ClientForm({ client, onDone }: { client: ClientListRow | null; onDone: () => void }) {
  const t = useT()
  const [c, setC] = useState<InvoiceClient>(client ?? EMPTY_CLIENT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = (key: keyof InvoiceClient, label: string, opts: { optional?: boolean; type?: string; placeholder?: string } = {}) => (
    <Field label={label} aside={opts.optional ? t('Optional') : undefined}>
      <input className="input" type={opts.type ?? 'text'} value={c[key]} onChange={(e) => setC({ ...c, [key]: e.target.value })} placeholder={opts.placeholder} />
    </Field>
  )
  return (
    <div className="space-y-4">
      {client && (
        <Link to="/app/invoices/new" search={{ client: client.id }} className="btn w-full">
          <FilePlus2 size={16} strokeWidth={1.75} /> {t('New invoice for {name}', { name: client.company || client.name })}
        </Link>
      )}
      {field('name', t('Name'), { placeholder: t('e.g. Asha Mushi') })}
      {field('company', t('Company'), { optional: true, placeholder: t('e.g. Bahari Logistics Ltd') })}
      {field('phone', t('WhatsApp number'), { optional: true, type: 'tel', placeholder: '0754 123 456' })}
      {field('email', t('Email'), { optional: true, type: 'email' })}
      {field('address', t('Address'), { optional: true })}
      {field('tin', t('Client’s TIN'), { optional: true, placeholder: '123-456-789' })}
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        className="btn btn-lg w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          const res = await saveClient({ data: { ...c, id: client?.id } })
          setBusy(false)
          if ('error' in res) return setError(res.error === 'name' ? t('Add a name or a company.') : t('Something went wrong. Try again.'))
          onDone()
        }}
      >
        {busy ? t('Saving') : t('Save client')}
      </button>
      {client && (
        <button
          type="button"
          className="w-full text-center text-14 font-medium text-bad"
          onClick={async () => {
            if (!window.confirm(t('Remove {name} from your clients? Their invoices stay as they are.', { name: client.company || client.name }))) return
            await deleteClient({ data: { id: client.id } })
            onDone()
          }}
        >
          {t('Remove client')}
        </button>
      )}
    </div>
  )
}
