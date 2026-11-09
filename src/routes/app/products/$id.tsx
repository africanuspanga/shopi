import { createFileRoute, notFound } from '@tanstack/react-router'
import { ProductForm } from '#/components/product-form'
import { Page } from '#/components/ui'
import { getMyProduct } from '#/lib/api/merchant'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/products/$id')({
  loader: async ({ params }) => {
    const product = await getMyProduct({ data: { id: params.id } })
    if (!product) throw notFound()
    return product
  },
  component: EditProduct,
})

function EditProduct() {
  const t = useT()
  const product = Route.useLoaderData()
  return (
    <Page nav wide>
      <ProductForm key={product.id} product={product} title={t('Edit product')} back="/app/products" />
    </Page>
  )
}
