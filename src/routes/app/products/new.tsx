import { createFileRoute } from '@tanstack/react-router'
import { ProductForm } from '#/components/product-form'
import { Page } from '#/components/ui'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/products/new')({ component: NewProduct })

function NewProduct() {
  const t = useT()
  return (
    <Page nav wide>
      <ProductForm title={t('New product')} back="/app/products" />
    </Page>
  )
}
