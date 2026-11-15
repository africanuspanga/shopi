import { Link } from '@tanstack/react-router'
import { Check, ClipboardPaste, Download, EyeOff, FileSpreadsheet, ImageIcon, ImagePlus, Layers, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chips, ErrorText, Field, Switch } from '#/components/ui'
import { importProducts, IMPORT_CHUNK, type ImportItem } from '#/lib/api/imports'
import { OPTION_KINDS, tzs, type OptionKind } from '#/lib/format'
import {
  FIELDS,
  TEMPLATE_COLUMNS,
  fileKey,
  isLink,
  previewPhotoLink,
  samples,
  templateCsv,
  type Draft,
  type Field as SheetField,
  type Issue,
} from '#/lib/import'
import { useT } from '#/lib/i18n'
import { SHEET_ACCEPT, SheetError, parseDelimited, readSheetFile, type SheetRow } from '#/lib/sheet'
import { uploadImage } from '#/lib/upload'

type T = ReturnType<typeof useT>
const KINDS = Object.keys(OPTION_KINDS) as OptionKind[]

/* ---------- 1. The sheet ---------- */

/** The template's columns, each with an example, as the "How your sheet should look" card shows them. */
const GUIDE: [string, string, string?][] = [
  [TEMPLATE_COLUMNS[0], 'Gauni la maua'],
  [TEMPLATE_COLUMNS[1], '45000'],
  [TEMPLATE_COLUMNS[2], '55000', 'Shows it as a sale'],
  [TEMPLATE_COLUMNS[3], '12'],
  [TEMPLATE_COLUMNS[4], 'S:3, M:5, L:2', 'A size and how many'],
  [TEMPLATE_COLUMNS[5], 'Gauni la pamba…'],
  [TEMPLATE_COLUMNS[6], 'https://… gauni-1.jpg', 'Links, or the names of photo files'],
  [TEMPLATE_COLUMNS[7], 'Magauni'],
]

export function PickSheet({ onRead }: { onRead: (rows: SheetRow[], name: string) => void }) {
  const t = useT()
  const [over, setOver] = useState(false)
  const [reading, setReading] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')

  async function read(file: File | undefined) {
    if (!file) return
    setError('')
    setReading(true)
    try {
      onRead(await readSheetFile(file), file.name)
    } catch (e) {
      const p = e instanceof SheetError ? e.problem : 'unreadable'
      setError(
        p === 'xls'
          ? t('This is an old Excel file (.xls). In Excel, choose Save as and Excel Workbook (.xlsx), then try again.')
          : p === 'empty'
            ? t('The sheet is empty.')
            : p === 'big'
              ? t('That file is over 20 MB. Save it without pictures inside, or split it.')
              : t('We can’t read this file. Save it as .xlsx or CSV and try again.'),
      )
    } finally {
      setReading(false)
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([templateCsv(t)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'shopi-products.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
      <div className="min-w-0 space-y-3">
        <label
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            read(e.dataTransfer.files[0])
          }}
          className="group flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-line-strong bg-card px-6 py-10 text-center transition-colors hover:border-ink has-[:focus-visible]:border-ink data-[over=true]:border-ink data-[over=true]:bg-well md:min-h-[340px]"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white transition-transform group-active:scale-95">
            {reading ? <Loader2 size={22} className="animate-spin" /> : <FileSpreadsheet size={22} strokeWidth={1.75} />}
          </span>
          <span>
            <span className="block text-[17px] font-medium">{reading ? t('Reading your sheet') : t('Choose your sheet')}</span>
            <span className="mt-1 block text-[14px] text-muted">{t('Excel (.xlsx) or CSV, up to 1,000 products')}</span>
            <span className="mt-0.5 hidden text-[14px] text-muted md:block">{t('Or drop it here')}</span>
          </span>
          <input
            type="file"
            accept={SHEET_ACCEPT}
            className="sr-only"
            disabled={reading}
            onChange={(e) => {
              read(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <ErrorText>{error}</ErrorText>
        {pasting ? (
          <div className="card space-y-3 p-5">
            <Field label={t('Rows from your sheet')} hint={t('In Excel or Google Sheets, select the rows with the column names on top, copy them and paste here.')}>
              <textarea className="input code min-h-40 text-[13px]" value={pasted} onChange={(e) => setPasted(e.target.value)} autoFocus />
            </Field>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!pasted.trim()}
              onClick={() => {
                const rows = parseDelimited(pasted)
                if (rows.length) onRead(rows, t('Pasted rows'))
                else setError(t('The sheet is empty.'))
              }}
            >
              {t('Read these rows')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPasting(true)}>
            <ClipboardPaste size={15} strokeWidth={1.75} /> {t('Paste rows instead')}
          </button>
        )}
      </div>

      <aside className="card p-5 md:p-6">
        <h2 className="title text-[19px]">{t('How your sheet should look')}</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{t('One product per row. Only the name and the price are needed.')}</p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {GUIDE.map(([label, example, hint]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-[14px] font-medium">
                {t(label)}
                {hint && <span className="block text-[12px] font-normal text-muted">{t(hint)}</span>}
              </dt>
              <dd className="code min-w-0 truncate text-right text-[12px] text-ink-2">{example}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">{t('Rows with the same name become one product with its sizes. A product export from Shopify works as it is.')}</p>
        <button type="button" className="btn btn-ghost btn-sm mt-5 w-full" onClick={download}>
          <Download size={15} strokeWidth={1.75} /> {t('Download the template')}
        </button>
      </aside>
    </div>
  )
}

/* ---------- 2. The columns ---------- */

/** "A", "B" … "AA": how Excel names a column. */
const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26))

export function MatchColumns({
  rows,
  header,
  fields,
  kind,
  onHeader,
  onField,
  onKind,
}: {
  rows: SheetRow[]
  header: boolean
  fields: SheetField[]
  kind: OptionKind
  onHeader: (v: boolean) => void
  onField: (col: number, f: SheetField) => void
  onKind: (k: OptionKind) => void
}) {
  const t = useT()
  const body = header ? rows.slice(1) : rows
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <Switch label={t('The first row has the column names')} checked={header} onChange={onHeader} />
      </div>
      <ul className="divide-y divide-line">
        {fields.map((f, col) => {
          const name = header ? rows[0]?.cells[col] : ''
          const vals = samples(body, col)
          return (
            <li key={col} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
              <div className={`min-w-0 ${f === 'skip' ? 'opacity-55' : ''}`}>
                <p className="truncate text-[15px] font-medium">{name || t('Column {letter}', { letter: letter(col) })}</p>
                <p className="code mt-1 truncate text-[12px] text-muted">{vals.length ? vals.join(' · ') : t('Empty')}</p>
              </div>
              <div className="grid gap-2">
                <select className="input h-11" aria-label={t('What this column holds')} value={f} onChange={(e) => onField(col, e.target.value as SheetField)}>
                  {FIELDS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {t(x.label)}
                    </option>
                  ))}
                </select>
                {f === 'options' && (
                  <select className="input h-11" aria-label={t('What buyers choose')} value={kind} onChange={(e) => onKind(e.target.value as OptionKind)}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t('Buyers choose: {what}', { what: t(OPTION_KINDS[k].label) })}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ---------- 3. The check ---------- */

export const fixIssue = (i: Issue | null) => i === 'name' || i === 'price' || i === 'twice'

function issueText(t: T, d: Draft) {
  switch (d.issue) {
    case 'name':
      return t('No name')
    case 'price':
      return t('No price')
    case 'twice':
      return t('Same name as row {n}', { n: d.first ?? '' })
    case 'exists':
      return t('Already in your shop')
    case 'example':
      return t('Example from the template')
    default:
      return ''
  }
}

/** Photo files the seller chose, by file name: "gauni-1.jpg" and "gauni-1" both find gauni-1.jpg. */
export type PhotoFiles = Map<string, File>
export function photoFiles(list: FileList | File[], into: PhotoFiles = new Map()) {
  const out = new Map(into)
  for (const f of Array.from(list)) {
    const k = fileKey(f.name)
    out.set(k, f)
    out.set(k.replace(/\.[a-z0-9]+$/, ''), f)
  }
  return out
}
export const findFile = (files: PhotoFiles, name: string) => files.get(fileKey(name)) ?? files.get(fileKey(name).replace(/\.[a-z0-9]+$/, ''))

function Thumb({ src, file }: { src?: string; file?: File }) {
  const [local, setLocal] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setLocal(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const shown = file ? local : src && isLink(src) && !broken ? previewPhotoLink(src) : null
  return (
    <span className="flex h-[68px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-well">
      {shown ? (
        <img src={shown} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={18} strokeWidth={1.5} className="text-faint" />
      )}
    </span>
  )
}

type Filter = 'all' | 'ready' | 'fix' | 'out'
const SHOWN = 60

export function DraftList({ drafts, files, kind }: { drafts: Draft[]; files: PhotoFiles; kind: OptionKind }) {
  const t = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const [more, setMore] = useState(false)
  const ready = drafts.filter((d) => !d.issue)
  const fix = drafts.filter((d) => fixIssue(d.issue))
  const out = drafts.filter((d) => d.issue && !fixIssue(d.issue))
  const list = filter === 'ready' ? ready : filter === 'fix' ? fix : filter === 'out' ? out : drafts
  const shown = more ? list : list.slice(0, SHOWN)
  return (
    <div className="min-w-0">
      <Chips
        value={filter}
        onChange={(f) => {
          setFilter(f)
          setMore(false)
        }}
        options={[
          { id: 'all', label: t('All'), count: drafts.length },
          { id: 'ready', label: t('Ready'), count: ready.length },
          ...(fix.length ? [{ id: 'fix' as const, label: t('Need a fix'), count: fix.length }] : []),
          ...(out.length ? [{ id: 'out' as const, label: t('Left out'), count: out.length }] : []),
        ]}
      />
      <ul className="card mt-4 divide-y divide-line overflow-hidden">
        {shown.map((d) => {
          const photo = d.photos[0]
          const details = [
            d.options.length ? `${t(OPTION_KINDS[kind].label)}: ${d.options.map((o) => o.label).join(', ')}` : '',
            d.stock != null ? t('{n} in stock', { n: d.stock }) : '',
            d.photos.length > 1 ? t('{n} photos', { n: d.photos.length }) : '',
            d.collections.join(', '),
          ].filter(Boolean)
          return (
            <li key={d.line} className={`flex gap-3.5 px-4 py-3.5 ${d.issue && !fixIssue(d.issue) ? 'opacity-60' : ''}`}>
              <Thumb src={photo} file={photo && !isLink(photo) ? findFile(files, photo) : undefined} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[15px] font-medium">{d.name || t('No name')}</p>
                  {d.price > 0 && (
                    <p className="tnum shrink-0 text-[14px]">
                      {d.compare && <span className="mr-1.5 text-muted line-through">{tzs(d.compare)}</span>}
                      {tzs(d.price)}
                    </p>
                  )}
                </div>
                {details.length > 0 && <p className="mt-0.5 truncate text-[13px] text-muted">{details.join(' · ')}</p>}
                <p className="meta mt-1">
                  {t('Row {n}', { n: d.line })}
                  {d.issue && <span className={fixIssue(d.issue) ? 'text-bad' : ''}> · {issueText(t, d)}</span>}
                </p>
              </div>
            </li>
          )
        })}
        {list.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-muted">{t('Nothing here')}</li>}
      </ul>
      {!more && list.length > SHOWN && (
        <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={() => setMore(true)}>
          {t('Show all {n}', { n: list.length })}
        </button>
      )}
    </div>
  )
}

/** The photo files a sheet names, and how many of them the seller has chosen. */
export function PhotoFilesCard({ drafts, files, onFiles }: { drafts: Draft[]; files: PhotoFiles; onFiles: (f: PhotoFiles) => void }) {
  const t = useT()
  const ref = useRef<HTMLInputElement>(null)
  const named = useMemo(() => [...new Set(drafts.filter((d) => !d.issue).flatMap((d) => d.photos.filter((p) => !isLink(p))))], [drafts])
  if (!named.length) return null
  const missing = named.filter((n) => !findFile(files, n))
  return (
    <div className="rounded-[16px] bg-page p-4">
      <p className="text-[14px] font-medium">{t('Photos named in your sheet')}</p>
      <p className="mt-0.5 text-[13px] leading-5 text-muted">
        {missing.length
          ? t('{found} of {n} chosen. Choose them all at once; we match them by file name.', { found: named.length - missing.length, n: named.length })
          : t('All {n} chosen.', { n: named.length })}
      </p>
      {missing.length > 0 && missing.length < named.length && (
        <p className="code mt-1.5 line-clamp-2 text-[12px] text-muted">{t('Not found: {names}', { names: missing.slice(0, 6).join(', ') + (missing.length > 6 ? '…' : '') })}</p>
      )}
      <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => ref.current?.click()}>
        <ImagePlus size={15} strokeWidth={1.75} /> {t('Choose photos')}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(photoFiles(e.target.files, files))
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ---------- 4. The import ---------- */

export type PhotoWhy = 'link' | 'fetch' | 'page' | 'big' | 'type' | 'limit' | 'missing' | 'decode' | 'upload'
export type PhotoMiss = { product: string; id?: string; src: string; why: PhotoWhy }
export type Progress = { done: number; total: number; now: string }
export type Outcome = {
  added: { id: string; name: string; hidden: boolean }[]
  misses: PhotoMiss[]
  collections: string[]
  stopped: boolean
  /** The connection dropped: what was added stays, and importing the sheet again adds the rest. */
  failed: boolean
}

class PhotoFail extends Error {
  constructor(public why: PhotoWhy) {
    super(why)
  }
}

/** A photo link fetched through Shopi (src/routes/api/photo.ts), then shrunk and uploaded like any photo. */
async function linkPhoto(src: string) {
  const res = await fetch(`/api/photo?url=${encodeURIComponent(src)}`).catch(() => null)
  if (!res) throw new PhotoFail('fetch')
  if (!res.ok) throw new PhotoFail(((await res.json().catch(() => null)) as { error?: PhotoWhy } | null)?.error ?? 'fetch')
  return res.blob()
}

async function upload(blob: Blob) {
  try {
    return await uploadImage(blob)
  } catch (e) {
    // createImageBitmap fails on photos this browser can't open (HEIC outside Safari); the upload itself fails otherwise.
    throw new PhotoFail(e instanceof DOMException || (e instanceof Error && e.message === 'encode') ? 'decode' : 'upload')
  }
}

/** Runs `fn` on every item, `limit` at a time. */
async function eachLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

/**
 * Imports the ready products in chunks: each chunk's photos are fetched or read and uploaded (three at a time), then the
 * chunk is saved. A stop or a dropped connection ends after the chunk in hand; what was saved stays.
 */
export async function runImport(
  drafts: Draft[],
  opts: { files: PhotoFiles; kind: OptionKind; active: boolean; stop: () => boolean; onProgress: (p: Progress) => void },
): Promise<Outcome> {
  const out: Outcome = { added: [], misses: [], collections: [], stopped: false, failed: false }
  const keys = new Map<string, Promise<string>>()
  const photoKey = (src: string) => {
    let p = keys.get(src)
    if (!p) {
      p = isLink(src)
        ? linkPhoto(src).then(upload)
        : (() => {
            const file = findFile(opts.files, src)
            return file ? upload(file) : Promise.reject(new PhotoFail('missing'))
          })()
      keys.set(src, p)
    }
    return p
  }
  let start = 0
  for (let at = 0; at < drafts.length; at += IMPORT_CHUNK) {
    if (opts.stop()) {
      out.stopped = true
      break
    }
    const chunk = drafts.slice(at, at + IMPORT_CHUNK)
    const photos = new Map<Draft, string[]>()
    const misses = new Map<Draft, PhotoMiss[]>()
    let done = at
    await eachLimit(chunk, 3, async (d) => {
      opts.onProgress({ done, total: drafts.length, now: d.name })
      const got: (string | null)[] = []
      for (const src of d.photos) {
        try {
          got.push(await photoKey(src))
        } catch (e) {
          got.push(null)
          misses.set(d, [...(misses.get(d) ?? []), { product: d.name, src, why: e instanceof PhotoFail ? e.why : 'upload' }])
        }
      }
      photos.set(d, got.filter((k): k is string => !!k))
      done++
    })
    opts.onProgress({ done, total: drafts.length, now: '' })
    const items: ImportItem[] = chunk.map((d, i) => ({
      index: at + i,
      name: d.name,
      description: d.description,
      price: d.price,
      compare_price: d.compare,
      stock: d.stock,
      sizes: d.options.map((o) => ({ label: o.label, stock: o.stock, price: o.price ?? null })),
      option_name: opts.kind,
      images: photos.get(d) ?? [],
      collections: d.collections,
    }))
    let res: Awaited<ReturnType<typeof importProducts>> | null = null
    for (let attempt = 0; attempt < 2 && !res; attempt++) res = await importProducts({ data: { products: items, active: opts.active, start } }).catch(() => null)
    if (!res) {
      out.failed = true
      break
    }
    start = res.start
    for (const a of res.added) {
      const d = drafts[a.index]
      out.added.push({ id: a.id, name: a.name, hidden: !opts.active || !(photos.get(d)?.length) })
      for (const m of misses.get(d) ?? []) out.misses.push({ ...m, id: a.id })
    }
    out.collections.push(...res.collections)
  }
  return out
}
/* ---------- 5. Done ---------- */

export function photoWhy(t: T, why: PhotoWhy) {
  return {
    link: t('Not a web link'),
    fetch: t('The link didn’t open'),
    page: t('The link opens a web page, not a photo'),
    big: t('The photo is over 15 MB'),
    type: t('Not a photo we can read'),
    limit: t('Too many photos this hour. Add it later.'),
    missing: t('The photo file wasn’t chosen'),
    decode: t('This browser can’t open the photo'),
    upload: t('The upload failed'),
  }[why]
}

export function ProgressCard({ progress, onStop, stopping }: { progress: Progress; onStop: () => void; stopping: boolean }) {
  const t = useT()
  const share = progress.total ? progress.done / progress.total : 0
  return (
    <div className="card p-6 md:p-8">
      <p className="title tnum text-[30px] md:text-[36px]">{t('{done} of {n}', { done: progress.done, n: progress.total })}</p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-full origin-left rounded-full bg-ink transition-transform duration-300 ease-[var(--ease-out)]" style={{ transform: `scaleX(${share})` }} />
      </div>
      <p className="mt-4 truncate text-[14px] text-muted">
        {stopping ? t('Stopping after these products') : progress.now ? t('Photos for {name}', { name: progress.now }) : t('Saving')}
      </p>
      <button type="button" className="btn btn-ghost btn-sm mt-6" disabled={stopping} onClick={onStop}>
        {t('Stop')}
      </button>
    </div>
  )
}

export function DoneCard({ outcome, children }: { outcome: Outcome; children: ReactNode }) {
  const t = useT()
  const hidden = outcome.added.filter((a) => a.hidden).length
  return (
    <div className="space-y-4">
      {(outcome.failed || outcome.stopped) && (
        <p className="rounded-[14px] bg-well px-4 py-3 text-[14px] leading-relaxed text-ink-2">
          {outcome.failed
            ? t('The connection dropped. Import the same sheet again: the products already added are left out, the rest come in.')
            : t('You stopped the import. Import the same sheet again to add the rest; the products already added are left out.')}
        </p>
      )}
      <div className="card divide-y divide-line">
        <Row
          ok
          icon={<Check size={14} strokeWidth={2} />}
          title={outcome.added.length - hidden === 1 ? t('1 product in your shop') : t('{n} products in your shop', { n: outcome.added.length - hidden })}
        />
        {hidden > 0 && (
          <Row icon={<EyeOff size={13} strokeWidth={1.75} />} title={t('{n} hidden until they have a photo', { n: hidden })} sub={t('Open each one, add a photo and turn on Show in my shop.')} />
        )}
        {outcome.collections.length > 0 && <Row icon={<Layers size={13} strokeWidth={1.75} />} title={t('New collections: {names}', { names: outcome.collections.join(', ') })} />}
      </div>
      {outcome.misses.length > 0 && (
        <section>
          <h2 className="title mt-8 text-[19px]">{t('Photos that didn’t come in')}</h2>
          <ul className="card mt-3 divide-y divide-line">
            {outcome.misses.map((m, i) => (
              <li key={i} className="px-5 py-3.5">
                {m.id ? (
                  <Link to="/app/products/$id" params={{ id: m.id }} className="text-[15px] font-medium underline-offset-4 hover:underline">
                    {m.product}
                  </Link>
                ) : (
                  <p className="text-[15px] font-medium">{m.product}</p>
                )}
                <p className="mt-0.5 text-[13px] text-bad">{photoWhy(t, m.why)}</p>
                <p className="code mt-1 truncate text-[12px] text-muted">{m.src}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2 pt-4">{children}</div>
    </div>
  )
}

function Row({ icon, title, sub, ok = false }: { icon: ReactNode; title: string; sub?: string; ok?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-ok/10 text-ok' : 'bg-well text-ink-2'}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{title}</p>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
    </div>
  )
}
