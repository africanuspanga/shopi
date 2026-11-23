import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { ShopAvatar } from '#/components/ui'
import { useT } from '#/lib/i18n'
import {
  DOC_LANG, STATEMENT, computeTotals, docDate, docWords, lineTotal, money, phoneText, plain, tinText, toCents,
  type DocData,
} from '#/lib/invoice'

/**
 * An invoice or quote as a page (roadmap `v-invoices`): the client's link, the business's preview while writing it,
 * and the setup's first invoice. The PDF (src/lib/invoice-pdf.tsx) draws the same document for A4. Always in English
 * (`DOC_LANG`), whatever the app's language.
 */
export function InvoiceDocument({ doc, className = '' }: { doc: DocData; className?: string }) {
  const w = docWords()
  const tr = w.tr
  const totals = computeTotals(doc.lines, doc.discount_type, doc.discount_value, doc.currency)
  const total = toCents(totals.total)
  const balance = Math.max(0, total - doc.paid)
  const b = doc.business
  const c = doc.client
  const taxed = doc.lines.some((l) => l.tax > 0)
  const businessLines = [b.address, [b.phone ? phoneText(b.phone) : '', b.email].filter(Boolean).join(' · '), [b.tin ? `${tr('TIN')} ${tinText(b.tin)}` : '', b.vrn ? `${tr('VRN')} ${b.vrn}` : ''].filter(Boolean).join(' · ')].filter(Boolean)
  const clientLines = [c.company && c.name ? c.name : '', c.address, [c.phone ? phoneText(c.phone) : '', c.email].filter(Boolean).join(' · '), c.tin ? `${tr('TIN')} ${tinText(c.tin)}` : ''].filter(Boolean)
  const pays = doc.kind === 'invoice' && (b.lipa || doc.pay_details)
  return (
    <article lang={DOC_LANG} className={`card min-w-0 overflow-hidden text-ink ${className}`}>
      <div className="p-5 md:p-8">
        <header className="flex flex-col-reverse gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ShopAvatar name={b.name} logo={b.logo_key} className="h-12 w-12 text-15" />
            <div className="min-w-0 pt-0.5">
              <p className="text-15 font-semibold">{b.name}</p>
              {businessLines.map((l) => (
                <p key={l} className="text-13 leading-5 text-muted">
                  {l}
                </p>
              ))}
            </div>
          </div>
          <div className="shrink-0 md:text-right">
            <p className="title text-28 md:text-32">{w.title(doc.kind)}</p>
            <p className="code mt-1 text-13 text-muted">{doc.number ?? tr('Draft')}</p>
          </div>
        </header>

        <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-13 text-muted">{tr('Bill to')}</p>
            <p className="mt-1 text-15 font-medium break-words">{c.company || c.name || '—'}</p>
            {clientLines.map((l) => (
              <p key={l} className="text-13 leading-5 text-ink-2 break-words">
                {l}
              </p>
            ))}
          </div>
          <dl className="grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-14 md:justify-self-end">
            <dt className="text-muted">{tr('Date')}</dt>
            <dd className="tnum">{docDate(doc.issue_day, DOC_LANG)}</dd>
            <dt className="text-muted">{w.dueLabel(doc.kind)}</dt>
            <dd className="tnum">{doc.due_day ? docDate(doc.due_day, DOC_LANG) : doc.kind === 'quote' ? '—' : tr('On receipt')}</dd>
            {doc.reference && (
              <>
                <dt className="text-muted">{tr('Reference')}</dt>
                <dd className="max-w-[24ch] break-words">{doc.reference}</dd>
              </>
            )}
          </dl>
        </div>

        {/* Lines: a table from md, stacked rows on phones. */}
        <table className="mt-8 hidden w-full text-14 md:table">
          <thead>
            <tr className="border-b border-ink text-left text-13 text-muted">
              <th className="pb-2 font-medium">{tr('Description')}</th>
              <th className="w-20 pb-2 text-right font-medium">{tr('Qty')}</th>
              <th className="w-32 pb-2 text-right font-medium">{tr('Price')}</th>
              <th className="w-36 pb-2 text-right font-medium">{tr('Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <p className="font-medium break-words">{l.name}</p>
                  {(l.description || l.tax > 0) && (
                    <p className="mt-0.5 text-13 leading-5 whitespace-pre-line text-muted">
                      {[l.description, l.tax > 0 ? tr('VAT {rate}%', { rate: l.tax }) : ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </td>
                <td className="tnum py-3 text-right">
                  {qtyText(l.qty)}
                  {l.unit ? ` ${l.unit}` : ''}
                </td>
                <td className="tnum py-3 text-right">{plain(l.price, doc.currency)}</td>
                <td className="tnum py-3 text-right">{plain(lineTotal(l, doc.currency), doc.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-6 divide-y divide-line border-y border-line md:hidden">
          {doc.lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-4 py-3 text-14">
              <div className="min-w-0">
                <p className="font-medium break-words">{l.name}</p>
                <p className="tnum mt-0.5 text-13 text-muted">
                  {qtyText(l.qty)}
                  {l.unit ? ` ${l.unit}` : ''} × {plain(l.price, doc.currency)}
                  {l.tax > 0 ? ` · ${tr('VAT {rate}%', { rate: l.tax })}` : ''}
                </p>
                {l.description && <p className="mt-0.5 text-13 leading-5 whitespace-pre-line text-muted">{l.description}</p>}
              </div>
              <p className="tnum shrink-0">{plain(lineTotal(l, doc.currency), doc.currency)}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5 ml-auto max-w-[340px] space-y-2 text-14">
          <Row label={tr('Subtotal')} value={money(toCents(totals.subtotal), doc.currency)} />
          {totals.discount > 0 && (
            <Row
              label={doc.discount_type === 'percent' ? tr('Discount ({value}%)', { value: doc.discount_value }) : tr('Discount')}
              value={`−${money(toCents(totals.discount), doc.currency)}`}
            />
          )}
          {taxed && <Row label={tr('VAT')} value={money(toCents(totals.tax), doc.currency)} />}
          <div className="flex items-baseline justify-between gap-4 border-t border-ink pt-3">
            <span className="text-15 font-semibold">{tr('Total')}</span>
            <span className="tnum text-20 font-semibold">{money(total, doc.currency)}</span>
          </div>
          {doc.kind === 'invoice' && doc.paid > 0 && (
            <>
              <Row label={tr('Paid')} value={`−${money(doc.paid, doc.currency)}`} />
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-15 font-semibold">{tr('Balance due')}</span>
                <span className="tnum text-17 font-semibold">{money(balance, doc.currency)}</span>
              </div>
            </>
          )}
        </div>

        {pays && (
          <section className="mt-8 rounded-16 bg-page p-4 md:p-5">
            <p className="text-13 text-muted">{tr('How to pay')}</p>
            {b.lipa && (
              <p className="mt-1.5 text-14 leading-6">
                {tr('Lipa Namba')}
                {b.lipa.network && !/lipa/i.test(b.lipa.network) ? ` · ${b.lipa.network}` : ''}: <span className="font-mono font-medium">{b.lipa.number}</span>
                {b.lipa.name ? <span className="text-ink-2"> · {b.lipa.name}</span> : null}
              </p>
            )}
            {doc.pay_details && <p className="mt-1.5 text-14 leading-6 whitespace-pre-line">{doc.pay_details}</p>}
          </section>
        )}

        {[
          [tr('Payment terms'), doc.payment_terms],
          [tr('Notes'), doc.notes],
          [tr('Terms and conditions'), doc.terms],
        ]
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <section key={label} className="mt-6">
              <p className="text-13 text-muted">{label}</p>
              <p className="mt-1 text-14 leading-6 whitespace-pre-line text-ink-2">{v}</p>
            </section>
          ))}

        {/* The document ends by saying what it is; nothing is printed after it. */}
        <p className="mt-10 text-12 font-semibold text-muted">{STATEMENT[doc.kind]}</p>
      </div>
    </article>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-2">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  )
}

const qtyText = (q: number) => q.toLocaleString('en-US', { maximumFractionDigits: 3 })

/** A PDF of the document, made in the browser when asked for (react-pdf is heavy, so it loads only then). */
export function usePdf(doc: DocData, onMade?: () => void) {
  const [busy, setBusy] = useState<'' | 'download' | 'share'>('')
  const name = `${[doc.number ?? 'draft', doc.client.company || doc.client.name].filter(Boolean).join(' ')}.pdf`.replace(/[\\/:*?"<>|]+/g, '-')
  const make = async () => {
    if (import.meta.env.SSR) throw new Error('browser only')
    const { invoicePdf } = await import('#/lib/invoice-pdf')
    return invoicePdf(doc)
  }
  return {
    busy,
    name,
    download: async () => {
      setBusy('download')
      try {
        const blob = await make()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        // Safari reads the blob after click() returns: revoking at once cancels the download.
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
        onMade?.()
      } finally {
        setBusy('')
      }
    },
    /** The PDF in the phone's share sheet (WhatsApp included); false where files can't be shared. */
    share: async (text: string) => {
      setBusy('share')
      try {
        const file = new File([await make()], name, { type: 'application/pdf' })
        if (!navigator.canShare?.({ files: [file] })) return false
        await navigator.share({ files: [file], text })
        onMade?.()
        return true
      } catch (e) {
        if ((e as Error).name === 'AbortError') return true
        return false
      } finally {
        setBusy('')
      }
    },
  }
}

/** The Download PDF button. */
export function PdfButton({ pdf, className = 'btn btn-ghost btn-sm' }: { pdf: ReturnType<typeof usePdf>; className?: string }) {
  const t = useT()
  return (
    <button type="button" className={className} disabled={!!pdf.busy} onClick={pdf.download}>
      {pdf.busy === 'download' ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : <FileDown size={16} strokeWidth={1.75} />}
      {pdf.busy === 'download' ? t('Making the PDF') : t('Download PDF')}
    </button>
  )
}
