import { useBlocker, useRouteContext, useRouter } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { ProductPicker } from '#/components/product-picker'
import { ShareActions, prettyUrl } from '#/components/share'
import { Card, CardHead, ErrorText, Field, Img, TopBar } from '#/components/ui'
import { deleteCollection, saveCollection, type CollectionRow } from '#/lib/api/collections'
import type { ProductRow } from '#/lib/api/merchant'
import { track } from '#/lib/analytics'
import { tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'

const FORM_ID = 'collection-form'

/** A collection's cover: its first four photos in a square, quiet wells where there are fewer. */
export function CollectionCover({ images, className = '' }: { images: string[]; className?: string }) {
  return (
    <div className={`grid shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-14 bg-well ${className}`}>
      {[0, 1, 2, 3].map((i) =>
        images[i] ? <Img key={i} size="thumb" k={images[i]} alt="" className="h-full w-full" /> : <div key={i} className="bg-well" />,
      )}
    </div>
  )
}

/** Make or change a collection: its name, an optional line, and its products in the order buyers see them. */
export function CollectionForm({ collection, products, title }: { collection?: CollectionRow; products: ProductRow[]; title: string }) {
  const t = useT()
  const router = useRouter()
  const start = useRef({ name: collection?.name ?? '', description: collection?.description ?? '', ids: collection?.productIds ?? [] })
  const [name, setName] = useState(start.current.name)
  const [description, setDescription] = useState(start.current.description)
  const [ids, setIds] = useState<string[]>(start.current.ids)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // A ref, not state: navigation runs before React re-renders, and the blocker must already know.
  const leaving = useRef(false)
  const dirty = JSON.stringify({ name, description, ids }) !== JSON.stringify(start.current)
  useBlocker({
    shouldBlockFn: () => !leaving.current && dirty && !window.confirm(t('Leave without saving? Your changes to this collection will be lost.')),
    enableBeforeUnload: () => !leaving.current && dirty,
  })

  const chosen = ids.flatMap((id) => products.filter((p) => p.id === id))
  const move = (i: number, by: -1 | 1) => {
    const next = [...ids]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    setIds(next)
  }

  async function save() {
    if (!name.trim()) return setError(t('Give the collection a name.'))
    setBusy(true)
    setError('')
    const res = await saveCollection({ data: { id: collection?.id, name, description, productIds: ids } })
    setBusy(false)
    if ('error' in res) return setError(res.error === 'name' ? t('Give the collection a name.') : t('Something went wrong. Try again.'))
    leaving.current = true
    router.navigate({ to: '/app/collections' })
  }

  async function remove() {
    if (!collection || !window.confirm(t('Delete {name}? Its link stops working. The products stay in your shop.', { name: collection.name }))) return
    await deleteCollection({ data: { id: collection.id } })
    leaving.current = true
    router.navigate({ to: '/app/collections' })
  }

  const saveButton = (
    <button form={FORM_ID} className="btn btn-lg w-full" disabled={busy}>
      {busy && <Loader2 size={16} className="animate-spin" />}
      {busy ? t('Saving') : collection ? t('Save changes') : t('Save collection')}
    </button>
  )

  return (
    <>
      <TopBar
        back="/app/collections"
        title={title}
        right={
          <button form={FORM_ID} className="btn btn-sm h-10 px-5" disabled={busy}>
            {busy ? t('Saving') : t('Save')}
          </button>
        }
      />
      <form
        id={FORM_ID}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="min-w-0 space-y-4">
          <Card title={t('Name')}>
            <div className="space-y-4">
              <Field label={t('Collection name')} hint={t('Short, like a shelf in a shop: Eid, Under 30k, New this week.')}>
                <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Eid collection')} />
              </Field>
              <Field label={t('A line under the name')} aside={t('Optional')}>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={200}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('e.g. Order by Thursday for delivery before Eid.')}
                />
              </Field>
            </div>
          </Card>

          <Card title={t('Products')} sub={chosen.length ? t('In the order buyers see them. Use the arrows to move one.') : undefined}>
            {chosen.length === 0 ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-16 border border-dashed border-line-strong px-6 py-10 text-center transition-colors hover:border-ink hover:bg-page"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white">
                  <Plus size={18} strokeWidth={2.25} />
                </span>
                <span className="text-15 font-medium">{t('Add products')}</span>
                <span className="text-13 text-muted">{t('Pick as many as you like')}</span>
              </button>
            ) : (
              <>
                <ul className="-mx-2 divide-y divide-line">
                  {chosen.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 px-2 py-2.5">
                      <span className="tnum hidden w-5 shrink-0 text-right text-13 text-muted sm:block">{i + 1}</span>
                      <Img size="thumb" k={p.images[0]} alt={p.name} className="h-12 w-10 shrink-0 rounded-8" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-14 leading-5 font-medium">{p.name}</span>
                        <span className="block text-13 text-muted">
                          <span className="tnum">{tzs(p.price)}</span>
                          {!p.active ? ` · ${t('Hidden')}` : p.stock === 0 ? ` · ${t('Sold out')}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center">
                        <IconButton label={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp size={16} strokeWidth={1.75} />
                        </IconButton>
                        <IconButton label={t('Move down')} disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown size={16} strokeWidth={1.75} />
                        </IconButton>
                        <IconButton label={t('Take out of the collection')} onClick={() => setIds(ids.filter((x) => x !== p.id))}>
                          <X size={16} strokeWidth={1.75} />
                        </IconButton>
                      </span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={() => setPicking(true)}>
                  <Plus size={16} strokeWidth={2.25} /> {t('Add or remove products')}
                </button>
                <p className="hint">{t('A product you hide stays in the collection, out of sight, until you show it again.')}</p>
              </>
            )}
          </Card>

          <div className="space-y-3 lg:hidden">
            <ErrorText>{error}</ErrorText>
            {saveButton}
            {collection && <ShareCard collection={collection} />}
          </div>

          {collection && (
            <button type="button" className="btn mt-4 w-full bg-transparent text-bad hover:bg-bad/[0.06] lg:w-auto" onClick={remove}>
              <Trash2 size={16} strokeWidth={1.75} /> {t('Delete collection')}
            </button>
          )}
        </div>

        <aside className="hidden space-y-4 lg:sticky lg:top-8 lg:block">
          <div className="card p-5">
            <p className="text-13 text-muted">{t('In your shop')}</p>
            <CollectionCover images={chosen.flatMap((p) => p.images.slice(0, 1))} className="mt-3 aspect-square w-full" />
            <p className="mt-3 truncate text-15 font-semibold">{name || t('Collection name')}</p>
            <p className="text-13 text-muted">{t(chosen.length === 1 ? '{n} product' : '{n} products', { n: chosen.length })}</p>
          </div>
          <ErrorText>{error}</ErrorText>
          {saveButton}
          {collection && <ShareCard collection={collection} />}
        </aside>
      </form>

      <ProductPicker
        open={picking}
        title={t('Products in this collection')}
        products={products}
        picked={new Set(ids)}
        onClose={() => setPicking(false)}
        onPick={(p) => setIds(ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id])}
      />
    </>
  )
}

/** Send the collection's link: it opens on these products, with the first photo in the WhatsApp preview. */
export function ShareCard({ collection }: { collection: Pick<CollectionRow, 'slug' | 'name'> }) {
  const t = useT()
  const { shop } = useRouteContext({ from: '/app' })
  const url = `${useOrigin()}/${shop.slug}/c/${collection.slug}`
  return (
    <section className="card p-5">
      <CardHead title={t('Share this collection')} />
      <p className="code mt-1 truncate text-12 text-muted">{prettyUrl(url)}</p>
      <div className="mt-4">
        <ShareActions
          url={url}
          title={collection.name}
          text={t('{name} at {shop}:', { name: collection.name, shop: shop.name })}
          onShared={(how) => track('seller_share', { shopId: shop.id, detail: `collection-${how}` })}
        />
      </div>
    </section>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-well disabled:text-faint disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}


