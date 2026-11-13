import { createFileRoute } from '@tanstack/react-router'
import { CollectionForm } from '#/components/collections'
import { Page } from '#/components/ui'
import { listMyProducts } from '#/lib/api/merchant'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/collections/new')({
  loader: () => listMyProducts(),
  head: () => ({ meta: [{ title: 'New collection · Shopi' }] }),
  component: NewCollection,
})

function NewCollection() {
  const t = useT()
  return (
    <Page nav wide>
      <CollectionForm products={Route.useLoaderData()} title={t('New collection')} />
    </Page>
  )
}
