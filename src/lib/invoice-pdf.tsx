import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { imgUrl } from '#/lib/format'
import {
  STATEMENT, computeTotals, docDate, docWords, lineTotal, money, phoneText, plain, tinText, toCents,
  type DocData,
} from '#/lib/invoice'

/**
 * An invoice or quote as an A4 PDF (roadmap `v-invoices`), drawn in the browser with @react-pdf/renderer, as Ankara
 * did. Loaded only when someone asks for a PDF (components/invoice.tsx, `usePdf`): it is heavy and never runs on the
 * server. The same document as the page, in Helvetica (built into every PDF reader, so nothing to download), ink on
 * white, the figures right-aligned. Ankara's lesson kept: tight spacing, so a document a line or two over one page
 * doesn't strand its totals alone on a second sheet.
 */

const INK = '#0A0A0A'
const MUTED = '#6D6A65'
const LINE = '#E3E1DC'
const SAND = '#F4F3F0'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, color: INK, lineHeight: 1.45, paddingTop: 40, paddingBottom: 40, paddingHorizontal: 44 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: MUTED },
  small: { fontSize: 8 },
  label: { fontSize: 8, color: MUTED, marginBottom: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  colItem: { flex: 1, paddingRight: 8 },
  colQty: { width: 48, textAlign: 'right' },
  colPrice: { width: 84, textAlign: 'right' },
  colAmount: { width: 90, textAlign: 'right' },
  totals: { marginTop: 12, alignSelf: 'flex-end', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  block: { marginTop: 12 },
})

export async function invoicePdf(doc: DocData): Promise<Blob> {
  const logo = doc.business.logo_key ? await asPng(imgUrl(doc.business.logo_key, 'thumb')) : null
  return pdf(<InvoicePdf doc={doc} logo={logo} />).toBlob()
}

/** react-pdf reads PNG and JPEG only; Shopi stores WebP, so the logo is redrawn as a PNG first. Null if it can't be. */
async function asPng(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bitmap = await createImageBitmap(await res.blob())
    const size = 240
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // A round logo, like the avatar on the page.
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max(size / bitmap.width, size / bitmap.height)
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function InvoicePdf({ doc, logo }: { doc: DocData; logo: string | null }) {
  const w = docWords(doc.lang)
  const tr = w.tr
  const totals = computeTotals(doc.lines, doc.discount_type, doc.discount_value, doc.currency)
  const total = toCents(totals.total)
  const balance = Math.max(0, total - doc.paid)
  const b = doc.business
  const c = doc.client
  const taxed = doc.lines.some((l) => l.tax > 0)
  const title = w.title(doc.kind)
  const businessLines = [b.address, [phoneText(b.phone), b.email].filter(Boolean).join('  ·  '), [b.tin ? `${tr('TIN')} ${tinText(b.tin)}` : '', b.vrn ? `${tr('VRN')} ${b.vrn}` : ''].filter(Boolean).join('  ·  ')].filter(Boolean)
  const clientLines = [c.company && c.name ? c.name : '', c.address, [phoneText(c.phone), c.email].filter(Boolean).join('  ·  '), c.tin ? `${tr('TIN')} ${tinText(c.tin)}` : ''].filter(Boolean)
  const initials = b.name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || 'S'
  const pays = doc.kind === 'invoice' && (b.lipa || doc.pay_details)

  return (
    <Document title={`${title} ${doc.number ?? ''}`.trim()} author={b.name} creator="Shopi · shopi.tz" producer="Shopi">
      <Page size="A4" style={s.page}>
        <View style={[s.between, { marginBottom: 22 }]}>
          <View style={{ flexDirection: 'row', maxWidth: 300 }}>
            {logo ? (
              <Image src={logo} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} />
            ) : (
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={[s.bold, { color: '#FFFFFF', fontSize: 12 }]}>{initials}</Text>
              </View>
            )}
            <View style={{ flexShrink: 1 }}>
              <Text style={[s.bold, { fontSize: 11 }]}>{b.name}</Text>
              {businessLines.map((l) => (
                <Text key={l} style={[s.muted, s.small]}>
                  {l}
                </Text>
              ))}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.bold, { fontSize: 22, lineHeight: 1.1, letterSpacing: -0.4 }]}>{title}</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{doc.number ?? tr('Draft')}</Text>
          </View>
        </View>

        <View style={[s.between, { marginBottom: 18 }]}>
          <View style={{ maxWidth: 280 }}>
            <Text style={s.label}>{tr('Bill to')}</Text>
            <Text style={s.bold}>{c.company || c.name || '—'}</Text>
            {clientLines.map((l) => (
              <Text key={l} style={s.small}>
                {l}
              </Text>
            ))}
          </View>
          <View>
            <Meta label={tr('Date')} value={docDate(doc.issue_day, doc.lang)} />
            <Meta label={w.dueLabel(doc.kind)} value={doc.due_day ? docDate(doc.due_day, doc.lang) : doc.kind === 'quote' ? '—' : tr('On receipt')} />
            {doc.reference ? <Meta label={tr('Reference')} value={doc.reference} /> : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: INK }}>
          <Text style={[s.colItem, s.muted, s.small]}>{tr('Description')}</Text>
          <Text style={[s.colQty, s.muted, s.small]}>{tr('Qty')}</Text>
          <Text style={[s.colPrice, s.muted, s.small]}>{tr('Price')}</Text>
          <Text style={[s.colAmount, s.muted, s.small]}>{tr('Amount')}</Text>
        </View>
        {doc.lines.map((l, i) => (
          <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.75, borderBottomColor: LINE }}>
            <View style={s.colItem}>
              <Text style={s.bold}>{l.name}</Text>
              {l.description || l.tax > 0 ? (
                <Text style={[s.muted, s.small]}>{[l.description, l.tax > 0 ? tr('VAT {rate}%', { rate: l.tax }) : ''].filter(Boolean).join('  ·  ')}</Text>
              ) : null}
            </View>
            <Text style={s.colQty}>
              {l.qty.toLocaleString('en-US', { maximumFractionDigits: 3 })}
              {l.unit ? ` ${l.unit}` : ''}
            </Text>
            <Text style={s.colPrice}>{plain(l.price, doc.currency)}</Text>
            <Text style={s.colAmount}>{plain(lineTotal(l, doc.currency), doc.currency)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <TotalRow label={tr('Subtotal')} value={money(toCents(totals.subtotal), doc.currency)} />
          {totals.discount > 0 ? (
            <TotalRow
              label={doc.discount_type === 'percent' ? tr('Discount ({value}%)', { value: doc.discount_value }) : tr('Discount')}
              value={`-${money(toCents(totals.discount), doc.currency)}`}
            />
          ) : null}
          {taxed ? <TotalRow label={tr('VAT')} value={money(toCents(totals.tax), doc.currency)} /> : null}
          <View style={[s.between, { borderTopWidth: 1.5, borderTopColor: INK, paddingTop: 6, marginTop: 3 }]}>
            <Text style={[s.bold, { fontSize: 11 }]}>{tr('Total')}</Text>
            <Text style={[s.bold, { fontSize: 11 }]}>{money(total, doc.currency)}</Text>
          </View>
          {doc.kind === 'invoice' && doc.paid > 0 ? (
            <>
              <View style={[s.totalRow, { marginTop: 5 }]}>
                <Text style={s.muted}>{tr('Paid')}</Text>
                <Text>-{money(doc.paid, doc.currency)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.bold}>{tr('Balance due')}</Text>
                <Text style={s.bold}>{money(balance, doc.currency)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {pays ? (
          <View wrap={false} style={{ marginTop: 16, padding: 10, borderRadius: 6, backgroundColor: SAND }}>
            <Text style={s.label}>{tr('How to pay')}</Text>
            {b.lipa ? (
              <Text>
                {tr('Lipa Namba')}
                {b.lipa.network && !/lipa/i.test(b.lipa.network) ? ` · ${b.lipa.network}` : ''}: <Text style={s.bold}>{b.lipa.number}</Text>
                {b.lipa.name ? ` · ${b.lipa.name}` : ''}
              </Text>
            ) : null}
            {doc.pay_details ? <Text style={{ marginTop: b.lipa ? 3 : 0 }}>{doc.pay_details}</Text> : null}
          </View>
        ) : null}

        {[
          [tr('Payment terms'), doc.payment_terms],
          [tr('Notes'), doc.notes],
          [tr('Terms and conditions'), doc.terms],
        ]
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <View key={label} style={s.block}>
              <Text style={s.label}>{label}</Text>
              <Text>{v}</Text>
            </View>
          ))}

        {/* The document ends here: nothing is printed after its statement. */}
        <View style={{ marginTop: 'auto', paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[s.bold, { fontSize: 7.5, color: MUTED }]}>{STATEMENT[doc.kind]}</Text>
          {doc.badge ? <Text style={{ fontSize: 7.5, color: MUTED }}>{tr('Made with Shopi · shopi.tz')}</Text> : null}
        </View>
      </Page>
    </Document>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 }}>
      <Text style={[s.muted, { marginRight: 10 }]}>{label}</Text>
      <Text style={{ minWidth: 70, textAlign: 'right' }}>{value}</Text>
    </View>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.totalRow}>
      <Text style={s.muted}>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}
