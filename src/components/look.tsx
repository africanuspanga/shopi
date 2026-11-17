import { Check, ImagePlus, Loader2, Pipette, Search, ShoppingBag, Store, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Tag } from '#/components/shop'
import { Img, ShopAvatar } from '#/components/ui'
import type { ProductRow, ShopRow } from '#/lib/api/merchant'
import { imgUrl, tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { COLORS, FONTS, MOTO, cleanHex, fontAttr, logoColors, shopColors, themeStyle, type FontId } from '#/lib/theme'
import { uploadImage } from '#/lib/upload'

export type Look = { color: string; font: FontId; cover: string | null }

/** A titled block of the look page. */
export function LookSection({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="card p-5 md:p-6">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="mt-1 text-[14px] leading-5 text-muted">{sub}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/* ---------- Cover ---------- */

export function CoverPicker({ cover, onChange, onError }: { cover: string | null; onChange: (key: string | null) => void; onError: (msg: string) => void }) {
  const t = useT()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadImage(file, 1600))
    } catch {
      onError(t('The photo did not upload. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => {
        pick(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )
  if (!cover) {
    return (
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="group flex aspect-[2/1] w-full flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-line-strong text-center transition-colors hover:border-ink md:aspect-[16/5]"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white transition-transform group-active:scale-95">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} strokeWidth={1.75} />}
        </span>
        <span className="px-6 text-[14px] font-medium">{busy ? t('Uploading') : t('Add a cover photo')}</span>
        {input}
      </button>
    )
  }
  return (
    <div>
      <div className="relative aspect-[2/1] overflow-hidden rounded-[16px] bg-well md:aspect-[16/5]">
        <Img k={cover} alt="" sizes="(min-width: 1024px) 700px, 100vw" className="h-full w-full" />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-card/60">
            <Loader2 size={22} className="animate-spin" />
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ref.current?.click()}>
          <ImagePlus size={15} strokeWidth={1.75} /> {t('Change photo')}
        </button>
        <button type="button" className="btn btn-sm bg-transparent text-bad hover:bg-bad/[0.06]" disabled={busy} onClick={() => onChange(null)}>
          <Trash2 size={15} strokeWidth={1.75} /> {t('Remove')}
        </button>
      </div>
      {input}
    </div>
  )
}

/* ---------- Colour ---------- */

function Swatch({ hex, name, on, onPick }: { hex: string; name: string; on: boolean; onPick: () => void }) {
  const c = shopColors(hex)
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={on}
      title={name}
      onClick={onPick}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 ${on ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : 'shadow-[inset_0_0_0_1px_rgb(10_10_10/0.1)]'}`}
      style={{ background: hex, color: c.onFill }}
    >
      {on && <Check size={18} strokeWidth={2.5} />}
    </button>
  )
}

export function ColorPicker({ value, logo, onChange }: { value: string; logo: string | null; onChange: (hex: string) => void }) {
  const t = useT()
  const [fromLogo, setFromLogo] = useState<string[]>([])
  const [typed, setTyped] = useState(value)
  useEffect(() => setTyped(value), [value])
  useEffect(() => {
    if (!logo) return setFromLogo([])
    let live = true
    logoColors(imgUrl(logo))
      .then((list) => live && setFromLogo(list))
      .catch(() => live && setFromLogo([]))
    return () => {
      live = false
    }
  }, [logo])
  const preset = COLORS.some((c) => c.hex === value) || fromLogo.includes(value)
  const c = shopColors(value)
  const notes = [
    c.text !== c.fill && t('Words in your colour, like “Only 2 left”, are a little darker so they stay easy to read.'),
    value !== MOTO && c.button !== c.fill && t('Buttons stay black: white writing on this colour is hard to read.'),
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-5">
      {fromLogo.length > 0 && (
        <div>
          <p className="label">{t('From your logo')}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {fromLogo.map((hex) => (
              <Swatch key={hex} hex={hex} name={`${t('From your logo')} ${hex}`} on={value === hex} onPick={() => onChange(hex)} />
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="label">{t('Tested colours')}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {COLORS.map((x) => (
            <Swatch key={x.hex} hex={x.hex} name={t(x.name)} on={value === x.hex} onPick={() => onChange(x.hex)} />
          ))}
        </div>
      </div>
      <div>
        <p className="label">{t('Your own colour')}</p>
        <div className="mt-2 flex items-center gap-3">
          <label
            className={`relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full ${!preset ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : 'shadow-[inset_0_0_0_1px_rgb(10_10_10/0.1)]'}`}
            style={{ background: !preset ? value : 'var(--color-well)', color: !preset ? c.onFill : 'var(--color-ink)' }}
          >
            {preset ? <Pipette size={17} strokeWidth={1.75} /> : <Check size={18} strokeWidth={2.5} />}
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label={t('Pick a colour')} value={value} onChange={(e) => onChange(e.target.value)} />
          </label>
          <span className="input flex h-11 w-40 items-center gap-1 px-3">
            <span className="code text-[14px] text-muted">#</span>
            <input
              className="code min-w-0 flex-1 bg-transparent text-[14px] uppercase outline-none"
              aria-label={t('Colour code')}
              value={typed.replace(/^#/, '')}
              maxLength={6}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-f]/gi, '')
                setTyped(`#${v}`)
                const hex = cleanHex(v)
                if (hex) onChange(hex)
              }}
            />
          </span>
        </div>
      </div>
      {notes.length > 0 && (
        <ul className="space-y-1.5 rounded-[14px] bg-page px-4 py-3 text-[13px] leading-5 text-ink-2">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------- Font ---------- */

/** `locked`: a free shop (fonts are Tembo); only the clean style can be chosen, the others show what Tembo gives. */
export function FontPicker({ value, name, onChange, locked = false }: { value: FontId; name: string; onChange: (f: FontId) => void; locked?: boolean }) {
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {FONTS.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={value === f.id}
          disabled={locked && f.id !== 'clean'}
          onClick={() => onChange(f.id)}
          className={`min-w-0 rounded-[16px] p-4 text-left transition-colors disabled:cursor-default disabled:opacity-55 ${value === f.id ? 'bg-card shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'bg-page enabled:hover:bg-well'}`}
        >
          <span data-font={fontAttr(f.id)} className="block">
            <span className="display block truncate text-[24px]">{name || 'Duka'}</span>
          </span>
          <span className="mt-3 flex items-center gap-1.5 text-[14px] font-medium">
            {t(f.name)}
            {value === f.id && <Check size={14} strokeWidth={2.5} />}
          </span>
          <span className="mt-0.5 block text-[12px] leading-4 text-muted">{t(f.feel)}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------- Preview ---------- */

/**
 * The seller's shop as buyers will see it, drawn with the real classes and tokens: cover, logo, name in the chosen
 * style, a sale tag and a bag count in the chosen colour, the main button, and the phone capsule.
 */
export function LookPreview({ shop, products, look, compact = false }: { shop: ShopRow; products: ProductRow[]; look: Look; compact?: boolean }) {
  const t = useT()
  const shown = products.filter((p) => p.images[0]).slice(0, 2)
  const sale = shown[0]
  return (
    <div style={themeStyle(look.color)} data-font={fontAttr(look.font)} className="overflow-hidden rounded-[28px] bg-card shadow-[inset_0_0_0_1px_var(--color-line)]">
      {look.cover && (
        <div className={`m-3 mb-0 overflow-hidden rounded-[16px] bg-well ${compact ? 'aspect-[4/1]' : 'aspect-[2/1]'}`}>
          <Img k={look.cover} alt="" sizes="400px" className="h-full w-full" />
        </div>
      )}
      <div className={compact ? 'px-4 pt-3 pb-4' : 'px-5 pt-5 pb-5'}>
        <div className={`flex gap-3 ${look.cover ? 'items-end' : 'items-center'}`}>
          <ShopAvatar
            name={shop.name}
            logo={shop.logo_key}
            className={`${compact ? 'h-11 w-11 text-[14px]' : 'h-14 w-14 text-[17px]'} ${look.cover ? `relative ml-2 ring-4 ring-card ${compact ? '-mt-6' : '-mt-8'}` : ''}`}
          />
          <div className="min-w-0 pb-0.5">
            <p className={`display truncate ${compact ? 'text-[22px]' : 'text-[28px]'}`}>{shop.name}</p>
            {!compact && shop.location && <p className="mt-1 truncate text-[13px] text-muted">{shop.location}</p>}
          </div>
        </div>
        <div className={`flex items-center gap-2 ${compact ? 'mt-3' : 'mt-4'}`}>
          <Tag hot>−20%</Tag>
          <span className="text-[13px] text-moto-ink">{t('Only {n} left', { n: 2 })}</span>
          <span className="ml-auto flex h-9 items-center gap-2 rounded-full pr-1 pl-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
            {t('Bag')}
            <span className="tnum flex h-7 min-w-7 items-center justify-center rounded-full bg-moto px-1.5 text-[12px] text-on-moto">2</span>
          </span>
        </div>
        {!compact && (
          <>
            {shown.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                {shown.map((p) => (
                  <div key={p.id} className="min-w-0">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-well">
                      <Img k={p.images[0]} alt="" size="thumb" className="h-full w-full" />
                      {p === sale && (
                        <span className="absolute top-2 left-2">
                          <Tag hot>−20%</Tag>
                        </span>
                      )}
                    </div>
                    <p className="mt-2 truncate text-[13px] font-medium">{p.name}</p>
                    <p className="tnum text-[13px] text-ink-2">{tzs(p.price)}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="title mt-5 text-[17px]">{t('All products')}</p>
            <span className="btn btn-shop mt-4 w-full">{t('Add to bag')}</span>
            <div className="mx-auto mt-5 flex h-14 max-w-[260px] items-center justify-around rounded-full bg-ink text-white">
              <Store size={19} strokeWidth={2} className="text-moto-lit" />
              <Search size={19} strokeWidth={1.6} />
              <span className="relative">
                <ShoppingBag size={19} strokeWidth={1.6} />
                <span className="tnum absolute -top-2 -right-2.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-moto-lit px-1 text-[10px] font-semibold text-on-moto-lit ring-2 ring-ink">2</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
