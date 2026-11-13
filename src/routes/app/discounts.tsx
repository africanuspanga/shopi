import { createFileRoute, useRouter } from '@tanstack/react-router'
import { PenLine, Plus, Share2, TicketPercent, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ShareActions, prettyUrl } from '#/components/share'
import { Empty, ErrorText, Field, Page, Sheet, Switch, TopBar } from '#/components/ui'
import { deleteDiscount, listDiscounts, saveDiscount, setDiscountActive, type DiscountRow } from '#/lib/api/discounts'
import { track } from '#/lib/analytics'
import { cleanCode, dayOf, discountLabel, type DiscountKind } from '#/lib/discounts'
import { tzs } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'

export const Route = createFileRoute('/app/discounts')({
  loader: () => listDiscounts(),
  head: () => ({ meta: [{ title: 'Discount codes · Shopi' }] }),
  component: Discounts,
})

type State = 'on' | 'off' | 'ended' | 'used_up'
const stateOf = (c: DiscountRow): State =>
  c.ends_at != null && c.ends_at < Date.now() ? 'ended' : c.max_uses != null && c.uses >= c.max_uses ? 'used_up' : c.active ? 'on' : 'off'

function Discounts() {
  const t = useT()
  const codes = Route.useLoaderData()
  const [editing, setEditing] = useState<DiscountRow | 'new' | null>(null)
  const [sharing, setSharing] = useState<DiscountRow | null>(null)
  const on = codes.filter((c) => stateOf(c) === 'on').length

  return (
    <Page nav wide>
      <TopBar
        back="/app/shop"
        title={t('Discount codes')}
        sub={codes.length ? t(on === 1 ? '{n} code buyers can use' : '{n} codes buyers can use', { n: on }) : t('Money off for buyers who type a code at checkout')}
        right={
          <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>
            <Plus size={15} strokeWidth={2} /> {t('New code')}
          </button>
        }
      />

      {codes.length === 0 ? (
        <Empty
          icon={<TicketPercent size={20} strokeWidth={1.5} />}
          title={t('No discount codes yet')}
          body={t('Make a code like EID10 for 10% off, share it in your status, and buyers type it at checkout.')}
          action={
            <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>
              <Plus size={15} strokeWidth={2} /> {t('New code')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {codes.map((c) => (
            <CodeCard key={c.id} c={c} onEdit={() => setEditing(c)} onShare={() => setSharing(c)} />
          ))}
        </div>
      )}

      {editing && <EditSheet key={editing === 'new' ? 'new' : editing.id} code={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ShareSheet c={sharing} onClose={() => setSharing(null)} />
    </Page>
  )
}

function useConditions() {
  const t = useT()
  const lang = useLang()
  return (c: Pick<DiscountRow, 'min_order' | 'ends_at' | 'max_uses'>) => {
    const parts = [
      c.min_order ? t('Orders from {min}', { min: tzs(c.min_order) }) : '',
      c.ends_at
        ? t('Until {date}', {
            date: new Date(c.ends_at).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' }),
          })
        : '',
      c.max_uses ? t(c.max_uses === 1 ? 'Up to {n} order' : 'Up to {n} orders', { n: c.max_uses }) : '',
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : t('Any order, no end date')
  }
}

function CodeCard({ c, onEdit, onShare }: { c: DiscountRow; onEdit: () => void; onShare: () => void }) {
  const t = useT()
  const router = useRouter()
  const conditions = useConditions()
  // The switch moves at once; the saved value takes over again once the list reloads.
  const [pending, setPending] = useState<boolean | null>(null)
  const active = pending ?? !!c.active
  const state = stateOf({ ...c, active: active ? 1 : 0 })
  const label: Record<State, string> = { on: t('On'), off: t('Off'), ended: t('Ended'), used_up: t('Used up') }
  return (
    <section className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="code truncate text-[20px]">{c.code}</p>
          <p className="mt-1 flex items-center gap-2 text-[15px] font-medium">
            {discountLabel(t, c)}
            <span className={`inline-flex items-center gap-1.5 text-[13px] font-normal ${state === 'on' ? 'text-ink-2' : 'text-muted'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${state === 'on' ? 'bg-ok' : 'bg-faint'}`} />
              {label[state]}
            </span>
          </p>
        </div>
        <Toggle
          label={t('Buyers can use {code}', { code: c.code })}
          checked={active}
          onChange={async (v) => {
            setPending(v)
            await setDiscountActive({ data: { id: c.id, active: v } })
            await router.invalidate()
            setPending(null)
          }}
        />
      </div>
      <p className="mt-2 text-[13px] leading-5 text-muted">{conditions(c)}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Stat label={t('Orders')} value={c.max_uses ? `${c.uses}/${c.max_uses}` : String(c.uses)} />
        <Stat label={t('Taken off')} value={tzs(c.off)} />
        <Stat label={t('Paid sales')} value={tzs(c.sales)} />
      </dl>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-quiet btn-sm flex-1" onClick={onShare} disabled={state !== 'on'}>
          <Share2 size={15} strokeWidth={1.6} /> {t('Share')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={onEdit}>
          <PenLine size={15} strokeWidth={1.6} /> {t('Edit')}
        </button>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12px] text-muted">{label}</dt>
      <dd className="tnum mt-0.5 truncate text-[15px] font-semibold">{value}</dd>
    </div>
  )
}

/** A compact on/off switch for a card corner; the full-row Switch is for forms. */
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer" title={label}>
      <input type="checkbox" className="peer sr-only" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="h-7 w-12 rounded-full bg-raised transition-colors duration-200 peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
      <span className="absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgb(10_10_10/0.2)] transition-transform duration-200 ease-[var(--ease-out)] peer-checked:translate-x-5" />
    </label>
  )
}

function EditSheet({ code, onClose }: { code: DiscountRow | null; onClose: () => void }) {
  const t = useT()
  const router = useRouter()
  const [form, setForm] = useState({
    code: code?.code ?? '',
    kind: (code?.kind ?? 'percent') as DiscountKind,
    value: code ? String(code.value) : '',
    min_order: code?.min_order ? String(code.min_order) : '',
    ends_on: code?.ends_at ? dayOf(code.ends_at) : '',
    max_uses: code?.max_uses ? String(code.max_uses) : '',
    active: code ? !!code.active : true,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const digits = (s: string, max = 9) => s.replace(/\D/g, '').slice(0, max)
  const money = (s: string) => (s ? Number(s).toLocaleString('en-US') : '')

  async function save() {
    setBusy(true)
    setError('')
    const res = await saveDiscount({ data: { ...form, id: code?.id } })
    setBusy(false)
    if ('error' in res) {
      return setError(
        {
          code: t('A code needs at least 3 letters or numbers.'),
          percent: t('A percent off is between 1 and 100.'),
          amount: t('Enter how many shillings off.'),
          date: t('That date doesn’t look right.'),
          taken: t('You already have a code with that name.'),
        }[res.error ?? 'code'],
      )
    }
    await router.invalidate()
    onClose()
  }

  async function remove() {
    if (!code || !window.confirm(t('Delete {code}? Orders that used it keep their discount.', { code: code.code }))) return
    setBusy(true)
    await deleteDiscount({ data: { id: code.id } })
    await router.invalidate()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={code ? t('Edit code') : t('New discount code')}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label={t('Code')} hint={t('Letters and numbers, like EID10 or KARIBU. Buyers type it at checkout.')}>
          <input
            className="input code uppercase"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="EID10"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: cleanCode(e.target.value) })}
          />
        </Field>
        <div>
          <p className="label">{t('Discount')}</p>
          <div className="flex gap-2" role="radiogroup" aria-label={t('Discount')}>
            {(
              [
                ['percent', t('Percent off')],
                ['amount', t('Shillings off')],
              ] as const
            ).map(([kind, label]) => (
              <button key={kind} type="button" role="radio" aria-checked={form.kind === kind} aria-pressed={form.kind === kind} className="chip" onClick={() => setForm({ ...form, kind, value: '' })}>
                {label}
              </button>
            ))}
          </div>
          <label className="input mt-3 flex items-center gap-2 px-4">
            {form.kind === 'amount' && <span className="text-[14px] text-muted">TSh</span>}
            <input
              className="tnum min-w-0 flex-1 bg-transparent outline-none"
              inputMode="numeric"
              aria-label={form.kind === 'percent' ? t('Percent off') : t('Shillings off')}
              placeholder={form.kind === 'percent' ? '10' : '5,000'}
              value={form.kind === 'percent' ? form.value : money(form.value)}
              onChange={(e) => setForm({ ...form, value: digits(e.target.value, form.kind === 'percent' ? 3 : 9) })}
            />
            {form.kind === 'percent' && <span className="text-[14px] text-muted">%</span>}
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Minimum order')} aside={t('Optional')}>
            <label className="input flex items-center gap-2 px-4">
              <span className="text-[14px] text-muted">TSh</span>
              <input
                className="tnum min-w-0 flex-1 bg-transparent outline-none"
                inputMode="numeric"
                placeholder="50,000"
                value={money(form.min_order)}
                onChange={(e) => setForm({ ...form, min_order: digits(e.target.value) })}
              />
            </label>
          </Field>
          <Field label={t('Last day')} aside={t('Optional')}>
            <input className="input" type="date" min={dayOf(Date.now())} value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
          </Field>
        </div>
        <Field label={t('Most orders')} aside={t('Optional')} hint={t('How many orders can use it. Cancelled orders don’t count.')}>
          <input className="input tnum" inputMode="numeric" placeholder={t('No limit')} value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: digits(e.target.value, 6) })} />
        </Field>
        <div className="rounded-[16px] bg-page p-4">
          <Switch
            label={t('Buyers can use it')}
            sub={form.active ? t('On: it works at checkout') : t('Off: nobody can use it until you switch it on')}
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-lg w-full" disabled={busy || !form.code || !form.value}>
          {busy ? t('Saving') : code ? t('Save changes') : t('Make the code')}
        </button>
        {code && (
          <button type="button" className="btn w-full bg-transparent text-bad hover:bg-bad/[0.06]" disabled={busy} onClick={remove}>
            <Trash2 size={16} strokeWidth={1.6} /> {t('Delete code')}
          </button>
        )}
      </form>
    </Sheet>
  )
}

/** A code works best as a link: shopi.tz/<shop>?code=EID10 applies it at checkout by itself. */
function ShareSheet({ c, onClose }: { c: DiscountRow | null; onClose: () => void }) {
  const t = useT()
  const { shop } = Route.useRouteContext()
  const url = `${useOrigin()}/${shop.slug}?code=${c?.code ?? ''}`
  return (
    <Sheet open={!!c} onClose={onClose} title={t('Share a code')}>
      {c && (
        <>
          <div className="rounded-[16px] bg-page px-5 py-4">
            <p className="code text-[22px]">{c.code}</p>
            <p className="mt-1 text-[14px] text-ink-2">{discountLabel(t, c)}</p>
          </div>
          <p className="mt-5 text-[14px] leading-relaxed text-muted">{t('The link opens your shop with the code saved. It comes off at checkout without typing.')}</p>
          <p className="code mt-3 truncate text-[12px] text-muted">{prettyUrl(url)}</p>
          <div className="mt-4">
            <ShareActions
              url={url}
              title={shop.name}
              text={t('Use code {code} for {off} at {shop}:', { code: c.code, off: discountLabel(t, c), shop: shop.name })}
              onShared={(how) => track('seller_share', { shopId: shop.id, detail: `code-${how}` })}
            />
          </div>
        </>
      )}
    </Sheet>
  )
}
