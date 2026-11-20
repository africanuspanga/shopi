import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { TemboPill } from '#/components/tembo'
import { Card, ErrorText, Field, FieldGroup, Page, Switch, TopBar } from '#/components/ui'
import { getBillSettings, saveBillSettings } from '#/lib/api/invoices'
import { LANGUAGES, useT } from '#/lib/i18n'
import { CURRENCIES, DUE_CHOICES, VAT, type BillSettings } from '#/lib/invoice'

/**
 * Invoice settings (roadmap `v-invoices`): how the business appears on its invoices (address, email, TIN, VRN) and how
 * clients pay it (bank details next to the Lipa Namba, terms, days to pay). The owner's: it says where money goes.
 */
export const Route = createFileRoute('/app/invoices/settings')({
  loader: () => getBillSettings(),
  head: () => ({ meta: [{ title: 'Invoice settings · Shopi' }] }),
  component: Settings,
})

function Settings() {
  const t = useT()
  const router = useRouter()
  const { shop, bill } = Route.useLoaderData()
  const [v, setV] = useState<BillSettings>(bill)
  const [tin, setTin] = useState(shop.tin)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [usdNote, setUsdNote] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<BillSettings>) => {
    setV((x) => ({ ...x, ...patch }))
    setSaved(false)
  }
  const save = async () => {
    setBusy(true)
    setError('')
    const res = await saveBillSettings({ data: { ...v, tin } })
    setBusy(false)
    if ('error' in res)
      return setError(
        res.error === 'email' ? t('That email doesn’t look right.') : res.error === 'tin' ? t('A TIN has 9 digits.') : res.error === 'usd' ? t('Invoices in US dollars come with Tembo.') : t('Something went wrong. Try again.'),
      )
    setSaved(true)
    router.invalidate()
  }

  return (
    <Page>
      <TopBar title={t('Invoice settings')} sub={t('Printed on every invoice and quote')} back="/app/invoices" />
      <div className="space-y-4">
        <Card title={t('Your business on invoices')} sub={t('Your name and logo come from your shop.')}>
          <div className="grid gap-4">
            <Field label={t('Address')} aside={t('Optional')}>
              <textarea className="input text-14" rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} placeholder={t('e.g. Plot 12, Kurasini, Dar es Salaam')} />
            </Field>
            <Field label={t('Email')} aside={t('Optional')}>
              <input className="input" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} placeholder="info@yourbusiness.co.tz" />
            </Field>
            <Field label={t('TIN')} aside={t('Optional')} hint={t('Your Taxpayer Identification Number from TRA, 9 digits.')}>
              <input className="input" inputMode="numeric" value={tin} onChange={(e) => (setTin(e.target.value), setSaved(false))} placeholder="123-456-789" />
            </Field>
            <Switch label={t('I am registered for VAT')} sub={t('New lines start with VAT {rate}%; you can take it off any line.', { rate: VAT })} checked={v.vat} onChange={(vat) => set({ vat })} />
            {v.vat && (
              <Field label={t('VRN')} hint={t('Your VAT registration number.')}>
                <input className="input" value={v.vrn} onChange={(e) => set({ vrn: e.target.value })} placeholder="40-012345-A" />
              </Field>
            )}
          </div>
        </Card>

        <Card title={t('How clients pay you')}>
          <div className="grid gap-4">
            <p className="rounded-14 bg-page px-4 py-3 text-14 text-ink-2">
              {shop.lipa_number ? (
                <>
                  {t('Lipa Namba')}: <span className="font-mono font-medium text-ink">{shop.lipa_number}</span>
                  {shop.lipa_name ? ` · ${shop.lipa_name}` : ''}
                </>
              ) : (
                t('No Lipa Namba yet.')
              )}{' '}
              <Link to="/app/shop" className="font-medium underline decoration-line-strong underline-offset-4">
                {t('Change it in Shop settings')}
              </Link>
            </p>
            <Field label={t('Bank and other details')} aside={t('Optional')} hint={t('One account per line is fine, or one per currency.')}>
              <textarea className="input text-14" rows={4} value={v.bank} onChange={(e) => set({ bank: e.target.value })} placeholder={t('e.g. CRDB Bank · Account name · 0150 0123 4567 00')} />
            </Field>
            <Field label={t('Payment terms')} aside={t('Optional')}>
              <input className="input" value={v.terms} onChange={(e) => set({ terms: e.target.value })} placeholder={t('e.g. Payment due within 14 days')} />
            </Field>
            <FieldGroup label={t('Days to pay a new invoice')} radio>
              <div className="flex flex-wrap gap-2">
                {DUE_CHOICES.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={v.due === d} aria-pressed={v.due === d} className="chip" onClick={() => set({ due: d })}>
                    {d === 0 ? t('On receipt') : t('{n} days', { n: d })}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </div>
        </Card>

        <Card title={t('New invoices')}>
          <div className="grid gap-4">
            <FieldGroup label={t('Currency')} radio>
              <div className="flex gap-2">
                {CURRENCIES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={v.currency === c} aria-pressed={v.currency === c} className="chip" onClick={() => (c !== 'TZS' && !shop.usd ? setUsdNote(true) : set({ currency: c }))}>
                    {c === 'TZS' ? 'TSh' : 'USD'}
                    {c !== 'TZS' && !shop.usd && <TemboPill />}
                  </button>
                ))}
              </div>
              {usdNote && (
                <p className="mt-2 text-13 text-muted">
                  {t('Invoices in US dollars come with Tembo.')}{' '}
                  <Link to="/app/plan" className="font-medium text-ink underline decoration-line-strong underline-offset-4">
                    {t('See what Tembo adds')}
                  </Link>
                </p>
              )}
            </FieldGroup>
            <FieldGroup label={t('Written in')} radio>
              <div className="flex gap-2">
                {LANGUAGES.map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={(v.lang || shop.lang) === id} aria-pressed={(v.lang || shop.lang) === id} className="chip" onClick={() => set({ lang: id })}>
                    {label}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </div>
        </Card>

        <ErrorText>{error}</ErrorText>
        <button type="button" className="btn btn-lg w-full md:w-auto md:px-10" disabled={busy} onClick={save}>
          {busy ? t('Saving') : saved ? t('Saved') : t('Save')}
        </button>
      </div>
    </Page>
  )
}
