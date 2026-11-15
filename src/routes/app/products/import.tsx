import { Link, createFileRoute, useBlocker } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { useHideFloatingNav } from '#/components/floating-nav'
import { DoneCard, DraftList, MatchColumns, PhotoFilesCard, PickSheet, ProgressCard, fixIssue, runImport, type Outcome, type PhotoFiles, type Progress } from '#/components/import'
import { ErrorText, Page, Switch, TopBar } from '#/components/ui'
import { listMyProducts } from '#/lib/api/merchant'
import type { OptionKind } from '#/lib/format'
import { MAX_IMPORT, TEMPLATE_COLUMNS, buildDrafts, guessFields, hasHeader, isLink, kindOf, type Field } from '#/lib/import'
import { translate, useT } from '#/lib/i18n'
import type { SheetRow } from '#/lib/sheet'

export const Route = createFileRoute('/app/products/import')({
  loader: () => listMyProducts(),
  head: () => ({ meta: [{ title: 'Import products · Shopi' }] }),
  component: ImportProducts,
})

/** The template's column names in Swahili, so a Swahili template matches itself. */
const SWAHILI_NAMES: Partial<Record<Field, string[]>> = Object.fromEntries(
  (['name', 'price', 'compare', 'stock', 'options', 'description', 'photo', 'collection'] as Field[]).map((f, i) => [f, [translate('sw', TEMPLATE_COLUMNS[i])]]),
)

type Step = 'pick' | 'match' | 'check' | 'run' | 'done'

function ImportProducts() {
  const t = useT()
  const products = Route.useLoaderData()
  const existing = useMemo(() => new Set(products.map((p) => p.name.toLowerCase())), [products])
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState('')
  const [rows, setRows] = useState<SheetRow[]>([])
  const [header, setHeader] = useState(true)
  const [fields, setFields] = useState<Field[]>([])
  const [kind, setKind] = useState<OptionKind>('size')
  const [files, setFiles] = useState<PhotoFiles>(new Map())
  const [active, setActive] = useState(true)
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0, now: '' })
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [stopping, setStopping] = useState(false)
  const stop = useRef(false)
  useHideFloatingNav(true)
  useBlocker({
    shouldBlockFn: () => step === 'run' && !window.confirm(t('Leave now? The import stops; the products already added stay.')),
    enableBeforeUnload: () => step === 'run',
  })

  const drafts = useMemo(() => (step === 'pick' ? [] : buildDrafts(rows, fields, header, existing)), [step, rows, fields, header, existing])
  const ready = drafts.filter((d) => !d.issue)
  const hasName = fields.includes('name')
  const hasPrice = fields.includes('price') || fields.includes('compare')
  const links = new Set(ready.flatMap((d) => d.photos.filter(isLink))).size
  const tooMany = ready.length > MAX_IMPORT

  function read(sheet: SheetRow[], name: string) {
    const head = hasHeader(sheet, Object.values(SWAHILI_NAMES).flat())
    const guess = guessFields(sheet, head, SWAHILI_NAMES)
    const optionsCol = guess.indexOf('options')
    setRows(sheet)
    setFile(name)
    setHeader(head)
    setFields(guess)
    setKind(head && optionsCol >= 0 ? kindOf(sheet, optionsCol) : 'size')
    setStep('match')
    window.scrollTo({ top: 0 })
  }

  function setField(col: number, f: Field) {
    // One column per field; photos may come from several (Photo 1, Photo 2).
    setFields(fields.map((x, i) => (i === col ? f : f !== 'skip' && f !== 'photo' && x === f ? 'skip' : x)))
    if (f === 'options' && header) setKind(kindOf(rows, col))
  }

  async function start() {
    stop.current = false
    setStopping(false)
    setProgress({ done: 0, total: ready.length, now: '' })
    setStep('run')
    window.scrollTo({ top: 0 })
    const result = await runImport(ready, { files, kind, active, stop: () => stop.current, onProgress: setProgress })
    setOutcome(result)
    setStep('done')
  }

  function again() {
    setRows([])
    setFiles(new Map())
    setOutcome(null)
    setStep('pick')
  }

  const title = { pick: t('Import products'), match: t('Match your columns'), check: t('Check the products'), run: t('Importing'), done: t('Import finished') }[step]
  const sub = {
    pick: t('Many products at once, from Excel, Google Sheets or a CSV file'),
    match: t('{file} · {n} rows', { file, n: header ? rows.length - 1 : rows.length }),
    check: t('{n} ready to import', { n: ready.length }),
    run: t('Keep this page open until it finishes.'),
    done: file,
  }[step]

  return (
    <Page wide>
      <TopBar back={step === 'run' ? undefined : '/app/products'} title={title} sub={sub} />

      {step === 'pick' && <PickSheet onRead={read} />}

      {step === 'match' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
          <MatchColumns rows={rows} header={header} fields={fields} kind={kind} onHeader={setHeader} onField={setField} onKind={setKind} />
          <aside className="card space-y-4 p-5 md:p-6 lg:sticky lg:top-6">
            <ul className="space-y-2 text-[14px]">
              <Need ok={hasName} label={t('A column with the name')} />
              <Need ok={hasPrice} label={t('A column with the price')} />
            </ul>
            <button type="button" className="btn w-full" disabled={!hasName || !hasPrice} onClick={() => setStep('check')}>
              {t('Check the products')}
            </button>
            <button type="button" className="btn btn-quiet btn-sm w-full" onClick={again}>
              {t('Choose another file')}
            </button>
          </aside>
        </div>
      )}

      {step === 'check' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
          <aside className="card space-y-4 p-5 md:p-6 lg:sticky lg:top-6 lg:order-2">
            <dl className="space-y-1.5 text-[14px]">
              <Count label={t('Ready')} n={ready.length} />
              <Count label={t('Need a fix')} n={drafts.filter((d) => fixIssue(d.issue)).length} tone="bad" />
              <Count label={t('Left out')} n={drafts.filter((d) => d.issue && !fixIssue(d.issue)).length} />
            </dl>
            <PhotoFilesCard drafts={drafts} files={files} onFiles={setFiles} />
            {links > 0 && (
              <p className="text-[13px] leading-5 text-muted">
                {links === 1
                  ? t('1 photo comes from a link. It is downloaded and made smaller before it goes in your shop, so Wi-Fi is best.')
                  : t('{n} photos come from links. Each is downloaded and made smaller before it goes in your shop, so Wi-Fi is best.', { n: links })}
              </p>
            )}
            <div className="border-t border-line pt-4">
              <Switch label={t('Show them in my shop now')} sub={t('Products without a photo stay hidden until you add one.')} checked={active} onChange={setActive} />
            </div>
            {tooMany && <ErrorText>{t('Up to 1,000 products at a time. Split the sheet and import each part.')}</ErrorText>}
            <button type="button" className="btn w-full" disabled={!ready.length || tooMany} onClick={start}>
              {ready.length === 1 ? t('Import 1 product') : t('Import {n} products', { n: ready.length })}
            </button>
            <p className="text-[13px] leading-5 text-muted">{t('Fix the other rows in your sheet and import it again later. Products already in your shop are left out.')}</p>
            <button type="button" className="btn btn-quiet btn-sm w-full" onClick={() => setStep('match')}>
              {t('Back to the columns')}
            </button>
          </aside>
          <DraftList drafts={drafts} files={files} kind={kind} />
        </div>
      )}

      {step === 'run' && (
        <div className="max-w-[560px]">
          <ProgressCard
            progress={progress}
            stopping={stopping}
            onStop={() => {
              stop.current = true
              setStopping(true)
            }}
          />
        </div>
      )}

      {step === 'done' && outcome && (
        <div className="max-w-[640px]">
          <DoneCard outcome={outcome}>
            <Link to="/app/products" className="btn w-full sm:w-auto">
              {t('See your products')}
            </Link>
            <button type="button" className="btn btn-ghost w-full sm:w-auto" onClick={again}>
              {t('Import another sheet')}
            </button>
          </DoneCard>
        </div>
      )}
    </Page>
  )
}

function Need({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2.5 ${ok ? '' : 'text-muted'}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-ok' : 'bg-raised'}`} />
      {label}
    </li>
  )
}

function Count({ label, n, tone }: { label: string; n: number; tone?: 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`tnum font-medium ${tone && n ? 'text-bad' : ''}`}>{n}</dd>
    </div>
  )
}
