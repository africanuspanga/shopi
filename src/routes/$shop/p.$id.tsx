import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

/** Old product links (/<shop>/p/<id>) move for good to the readable ones (/<shop>/<product>). */
export const Route = createFileRoute('/$shop/p/$id')({
  loader: async ({ params, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    const product = loaderData?.products.find((p) => p.id === params.id)
    if (!product) throw notFound()
    throw redirect({ to: '/$shop/$product', params: { shop: params.shop, product: product.slug ?? product.id }, statusCode: 301 })
  },
})
