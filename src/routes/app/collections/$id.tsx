import { createFileRoute, notFound } from '@tanstack/react-router'
import { CollectionForm } from '#/components/collections'
import { Page } from '#/components/ui'
import { listCollections } from '#/lib/api/collections'
import { listMyProducts } from '#/lib/api/merchant'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/collections/$id')({
  loader: async ({ params }) => {
    const [collections, products] = await Promise.all([listCollections(), listMyProducts()])
    const collection = collections.find((c) => c.id === params.id)
    if (!collection) throw notFound()
    return { collection, products }
  },
  head: () => ({ meta: [{ title: 'Collection · Shopi' }] }),
  component: EditCollection,
})

function EditCollection() {
  const t = useT()
  const { collection, products } = Route.useLoaderData()
  return (
    <Page nav wide>
      <CollectionForm key={collection.id} collection={collection} products={products} title={t('Edit collection')} />
    </Page>
  )
}
