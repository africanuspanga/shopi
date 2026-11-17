import { createFileRoute, notFound } from '@tanstack/react-router'
import { ProductForm } from '#/components/product-form'
import { WaitingCard } from '#/components/stock-alerts'
import { Page } from '#/components/ui'
import { listStockAlerts } from '#/lib/api/alerts'
import { getMyProduct } from '#/lib/api/merchant'
import { getMyPicks } from '#/lib/api/picks'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/products/$id')({
  loader: async ({ params }) => {
    const [product, alerts, picks] = await Promise.all([
      getMyProduct({ data: { id: params.id } }),
      listStockAlerts({ data: { productId: params.id } }),
      getMyPicks(),
    ])
    if (!product) throw notFound()
    return { product, alerts, picks }
  },
  component: EditProduct,
})

function EditProduct() {
  const t = useT()
  const { product, alerts, picks } = Route.useLoaderData()
  return (
    <Page nav wide>
      <ProductForm
        key={product.id}
        product={product}
        title={t('Edit product')}
        back="/app/products"
        picks={picks}
        top={alerts.length > 0 ? <WaitingCard product={product} alerts={alerts} /> : undefined}
      />
    </Page>
  )
}
