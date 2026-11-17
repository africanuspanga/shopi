import { createFileRoute } from '@tanstack/react-router'
import { ProductForm } from '#/components/product-form'
import { Page } from '#/components/ui'
import { getMyPicks } from '#/lib/api/picks'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/products/new')({
  // The shop's top picks, so the form knows whether this one can be a pick.
  loader: () => getMyPicks(),
  component: NewProduct,
})

function NewProduct() {
  const t = useT()
  const picks = Route.useLoaderData()
  return (
    <Page nav wide>
      <ProductForm title={t('New product')} back="/app/products" picks={picks} />
    </Page>
  )
}
