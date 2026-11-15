import { createFileRoute, useBlocker, useRouter } from '@tanstack/react-router'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useHideFloatingNav } from '#/components/floating-nav'
import { ColorPicker, CoverPicker, FontPicker, LookPreview, LookSection, type Look } from '#/components/look'
import { ErrorText, Page, Toast, TopBar } from '#/components/ui'
import { saveShopLook } from '#/lib/api/look'
import { getMyShop, listMyProducts } from '#/lib/api/merchant'
import { useT } from '#/lib/i18n'
import { MOTO, asFont, cleanHex } from '#/lib/theme'

export const Route = createFileRoute('/app/look')({
  loader: async () => {
    const [{ shop }, products] = await Promise.all([getMyShop(), listMyProducts()])
    return { shop, products }
  },
  head: () => ({ meta: [{ title: 'Shop look · Shopi' }] }),
  component: ShopLook,
})

function ShopLook() {
  const t = useT()
  const router = useRouter()
  const { shop, products } = Route.useLoaderData()
  const saved = useRef<Look>({ color: cleanHex(shop.theme_color) ?? MOTO, font: asFont(shop.theme_font), cover: shop.cover_key })
  const [look, setLook] = useState<Look>(saved.current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const dirty = JSON.stringify(look) !== JSON.stringify(saved.current)
  // A form: no capsule here.
  useHideFloatingNav(true)
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm(t('Leave without saving? Your changes to the look of your shop will be lost.')),
    enableBeforeUnload: () => dirty,
  })

  async function save() {
    setBusy(true)
    setError('')
    try {
      await saveShopLook({ data: look })
      saved.current = look
      setDone(true)
      setTimeout(() => setDone(false), 2200)
      router.invalidate()
    } catch {
      setError(t('Something went wrong. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page wide>
      <TopBar
        back="/app/shop"
        title={t('Shop look')}
        sub={t('Your colour, the style of your name, and a cover photo')}
        right={
          <button type="button" className="btn btn-sm h-10 px-5" disabled={busy || !dirty} onClick={save}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? t('Saving') : t('Save')}
          </button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
        {/* Phones: a short preview stays in view while the seller taps colours and styles. */}
        <div className="sticky top-2 z-10 -mx-1 rounded-[30px] bg-page p-1 lg:hidden">
          <LookPreview shop={shop} products={products} look={look} compact />
        </div>
        <div className="min-w-0 space-y-4">
          <ErrorText>{error}</ErrorText>
          <LookSection title={t('Cover photo')} sub={t('A wide photo across the top of your shop: your products, your shop, your style.')}>
            <CoverPicker cover={look.cover} onChange={(cover) => setLook({ ...look, cover })} onError={setError} />
          </LookSection>
          <LookSection title={t('Colour')} sub={t('For the bag count, sale tags and the main buttons in your shop. The rest stays black and white so your photos stand out.')}>
            <ColorPicker value={look.color} logo={shop.logo_key} onChange={(color) => setLook({ ...look, color })} />
          </LookSection>
          <LookSection title={t('Style of your name')} sub={t('For your shop’s name and headings. Prices, details and checkout stay in Shopi’s letters so they are easy to read.')}>
            <FontPicker value={look.font} name={shop.name} onChange={(font) => setLook({ ...look, font })} />
          </LookSection>
        </div>
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <p className="meta mb-3">{t('Preview')}</p>
          <LookPreview shop={shop} products={products} look={look} />
          <a href={`/${shop.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm mt-4 w-full">
            {t('Open your shop')} <ArrowUpRight size={15} strokeWidth={1.75} />
          </a>
        </aside>
      </div>
      <Toast show={done}>{t('Saved. Your shop has its new look.')}</Toast>
    </Page>
  )
}
