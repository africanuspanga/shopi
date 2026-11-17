import { useState, type ReactNode } from 'react'
import { Img, Money, scrubIndex, shortNumber } from '#/components/ui'
import type { DayPoint } from '#/lib/admin'
import { shortDay, tzs } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'

/** Shared parts of the owner dashboard (/admin). */
export const num = (v: number) => Math.round(v).toLocaleString('en-US')
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

export function useDates() {
  const lang = useLang()
  const locale = lang === 'sw' ? 'sw-TZ' : 'en-GB'
  return {
    /** A moment in time, shown as its day in Tanzania. */
    date: (ms: number, year = false) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: year ? 'numeric' : undefined, timeZone: 'Africa/Dar_es_Salaam' }),
    /** A chart day (already a Tanzania day, stored at UTC midnight). */
    day: (ms: number, weekday = false) => new Date(ms).toLocaleDateString(locale, { weekday: weekday ? 'short' : undefined, day: 'numeric', month: 'short', timeZone: 'UTC' }),
  }
}

/** Change against the period before, as a chip: up is green, down is red. Nothing to compare with shows no chip. */
export function Change({ now, before, flip = false }: { now: number; before: number; flip?: boolean }) {
  if (!before) return null
  const p = Math.round(((now - before) / before) * 100)
  const up = p >= 0
  const good = flip ? !up : up
  return (
    <span className={`tnum inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[12px] font-medium ${p === 0 ? 'bg-well text-ink-2' : good ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad'}`}>
      {up ? '↑' : '↓'} {Math.abs(p)}%
    </span>
  )
}

export function Kpi({ label, value, now, before, vs, flip, note }: { label: string; value: ReactNode; now?: number; before?: number; vs?: string; flip?: boolean; note?: ReactNode }) {
  return (
    <div className="card min-w-0 p-4 md:p-5">
      <span className="block text-[13px] text-muted">{label}</span>
      <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="tnum text-[20px] font-semibold tracking-[-0.02em] whitespace-nowrap md:text-[26px]">{value}</span>
        {now !== undefined && before !== undefined && <Change now={now} before={before} flip={flip} />}
      </span>
      <span className="mt-1.5 block text-[12.5px] leading-[18px] text-muted">{note ?? vs}</span>
    </div>
  )
}

/** Money for a number card: short from a million up where the card is narrow. */
export function KpiMoney({ value }: { value: number }) {
  return (
    <>
      <Money value={value} short cur="text-[0.62em] text-muted" className="xl:hidden" />
      <Money value={value} cur="text-[0.62em] text-muted" className="hidden xl:inline" />
    </>
  )
}

export function Card({ title, sub, right, children, className = '' }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-5 md:p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] leading-5 text-pretty text-muted">{sub}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  )
}

export function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 text-[14px] ${strong ? 'border-t border-line pt-3.5 font-medium' : ''}`}>
      <span className={strong ? '' : 'text-ink-2'}>{label}</span>
      <span className="tnum max-w-[60%] shrink-0 text-right [overflow-wrap:anywhere]">{value}</span>
    </div>
  )
}

export function Nothing({ children }: { children: ReactNode }) {
  return <p className="rounded-[14px] bg-page px-4 py-6 text-center text-[14px] text-muted">{children}</p>
}

/** Rows with a quiet bar behind the figures: sources, cities, features. */
export function BarList({ rows, total, empty }: { rows: { label: string; value: number; text?: ReactNode }[]; total?: number; empty: string }) {
  const top = total ?? Math.max(...rows.map((r) => r.value), 1)
  if (!rows.length) return <Nothing>{empty}</Nothing>
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-4 text-[14px]">
            <span className="min-w-0 truncate text-ink-2">{r.label}</span>
            <span className="tnum shrink-0">{r.text ?? num(r.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
            <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (r.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Bars by day with a headline figure: the range's total, or the day under the finger or the mouse. Today's bar is Moto.
 */
export function DayChart({ points, money = false, total, chip, caption, className = '' }: { points: DayPoint[]; money?: boolean; total: number; chip?: ReactNode; caption: string; className?: string }) {
  const t = useT()
  const { day } = useDates()
  const [sel, setSel] = useState<number | null>(null)
  const peak = Math.max(...points.map((p) => p.value), 1)
  const last = points.length - 1
  const chosen = sel === null ? null : points[sel]
  const show = (v: number) => (money ? tzs(v) : num(v))
  const gap = points.length > 45 ? 'gap-px' : points.length > 10 ? 'gap-1' : 'gap-2 md:gap-3'
  const marks = [0, Math.floor(last / 2), last]
  return (
    <div className={className}>
      <p className="text-[13px] text-muted">{chosen ? (sel === last ? t('Today') : day(chosen.day, true)) : caption}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="tnum text-[28px] font-semibold tracking-[-0.025em] whitespace-nowrap md:text-[34px]">
          {money ? <Money value={chosen ? chosen.value : total} cur="text-[0.55em] text-muted" /> : num(chosen ? chosen.value : total)}
        </span>
        {!chosen && chip}
      </p>
      <div className="relative mt-5 h-[150px] md:h-[190px] lg:h-[220px]">
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${f * 100}%` }}>
            {/* A count of 3 has no honest halfway label. */}
            {(money || Number.isInteger(peak * f)) && <span className="meta absolute -top-2 right-0 bg-card pl-1.5 text-[11px]">{peak >= 1e6 ? shortNumber(peak * f) : num(peak * f)}</span>}
          </div>
        ))}
        <div
          className={`absolute inset-0 flex touch-pan-y items-end border-b border-line ${gap}`}
          onPointerDown={(e) => e.pointerType !== 'mouse' && setSel(scrubIndex(e, points.length))}
          onPointerMove={(e) => e.pointerType !== 'mouse' && setSel(scrubIndex(e, points.length))}
          onPointerLeave={() => setSel(null)}
        >
          {points.map((p, i) => (
            <button
              key={p.day}
              type="button"
              className="group flex h-full min-w-0 flex-1 items-end"
              onClick={() => setSel(i)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(i)}
              onFocus={() => setSel(i)}
              onBlur={() => setSel(null)}
              aria-label={`${day(p.day, true)}: ${show(p.value)}`}
            >
              <span
                className={`w-full rounded-t-[3px] transition-colors ${i === last ? 'bg-moto' : sel === i ? 'bg-ink' : 'bg-raised group-hover:bg-faint'}`}
                style={{ height: `${Math.max(1, (p.value / peak) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="meta mt-2 flex justify-between text-[11px]">
        {marks.map((i, n) => (
          <span key={n} className={i === last ? 'text-ink' : ''}>
            {i === last ? t('Today') : day(points[i].day)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Seven bars, Monday first; the busiest day is ink and carries its figure. */
export function WeekdayBars({ counts }: { counts: number[] }) {
  const lang = useLang()
  const names = Array.from({ length: 7 }, (_, i) => shortDay(lang, i))
  const order = [1, 2, 3, 4, 5, 6, 0]
  const peak = Math.max(...counts, 1)
  const best = counts.indexOf(Math.max(...counts))
  return (
    <div className="flex h-[150px] items-end gap-2">
      {order.map((d) => {
        const top = counts[d] > 0 && d === best
        return (
          <div key={d} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className={`tnum text-[12px] font-medium ${top ? '' : 'text-muted'}`}>{num(counts[d])}</span>
            <span className={`w-full rounded-[8px] ${top ? 'bg-ink' : 'bg-raised'}`} style={{ height: `${Math.max(4, (counts[d] / peak) * 70)}%` }} />
            <span className={`meta text-[11px] ${top ? 'text-ink' : ''}`}>{names[d]}</span>
          </div>
        )
      })}
    </div>
  )
}

/** A half ring for one share, the figure inside it. */
export function Gauge({ value, label }: { value: number; label: string }) {
  const r = 80
  const len = Math.PI * r
  const v = Math.min(100, Math.max(0, value))
  return (
    <div className="relative mx-auto w-full max-w-[240px]">
      <svg viewBox="0 0 200 112" className="block w-full" aria-hidden="true">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-raised" />
        {v > 0 && <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-ink" strokeDasharray={`${(v / 100) * len} ${len}`} />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="tnum text-[34px] leading-none font-semibold tracking-[-0.03em]">{v}%</p>
        <p className="mt-1.5 text-[12.5px] text-muted">{label}</p>
      </div>
    </div>
  )
}

export type ProductRow = { name: string; image: string | null; shop: string; slug: string; pslug: string | null; sold: number; revenue: number }

/** Best sellers: a table on desktop, two-line rows on phones. `withShop` names the shop under each product. */
export function ProductTable({ rows, empty, withShop = true }: { rows: ProductRow[]; empty: string; withShop?: boolean }) {
  const t = useT()
  if (!rows.length) return <Nothing>{empty}</Nothing>
  const thumb = (p: ProductRow) =>
    p.image ? <Img k={p.image} alt="" size="thumb" className="h-10 w-10 shrink-0 rounded-[10px] bg-well object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-[10px] bg-well" />
  const href = (p: ProductRow) => (p.pslug ? `/${p.slug}/${p.pslug}` : `/${p.slug}`)
  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((p, i) => (
          <li key={i}>
            <a href={href(p)} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-3">
              {thumb(p)}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="line-clamp-2 min-w-0 text-[14.5px] font-medium">{p.name}</span>
                  <Money value={p.revenue} className="shrink-0 text-[14.5px]" cur="text-[0.8em] text-muted" />
                </span>
                <span className="mt-0.5 flex justify-between gap-3 text-[13px] text-muted">
                  <span className="min-w-0 truncate">{withShop ? p.shop : ''}</span>
                  <span className="tnum shrink-0">{t('{n} sold', { n: num(p.sold) })}</span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-left text-[14px] md:table">
        <thead>
          <tr className="border-b border-line text-[13px] text-muted">
            <th className="w-8 py-2.5 pr-3 font-normal">#</th>
            <th className="py-2.5 pr-4 font-normal">{t('Product')}</th>
            {withShop && <th className="py-2.5 pr-4 font-normal">{t('Shop')}</th>}
            <th className="py-2.5 pr-4 text-right font-normal">{t('Sold')}</th>
            <th className="py-2.5 text-right font-normal">{t('Sales')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p, i) => (
            <tr key={i}>
              <td className="meta py-2.5 pr-3">{i + 1}</td>
              <td className="max-w-[280px] py-2.5 pr-4">
                <a href={href(p)} target="_blank" rel="noreferrer" className="flex items-center gap-3 font-medium hover:underline">
                  {thumb(p)}
                  <span className="truncate">{p.name}</span>
                </a>
              </td>
              {withShop && <td className="max-w-[180px] truncate py-2.5 pr-4 text-ink-2">{p.shop}</td>}
              <td className="tnum py-2.5 pr-4 text-right">{num(p.sold)}</td>
              <td className="py-2.5 text-right">
                <Money value={p.revenue} cur="text-[0.8em] text-muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
