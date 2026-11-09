import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { ignoreShop } from '#/lib/analytics'
import { getStorefront } from '#/lib/api/store'
import { imgUrl } from '#/lib/format'

export const Route = createFileRoute('/$shop')({
  loader: async ({ params }) => {
    const data = await getStorefront({ data: { slug: params.shop } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] }
    const { shop, products, origin } = loaderData
    const cover = products[0]?.images[0] ?? shop.logo_key
    const description = shop.bio || `${shop.name} on RIZK`
    return {
      meta: [
        { title: `${shop.name} · RIZK` },
        { name: 'description', content: description },
        { property: 'og:title', content: shop.name },
        { property: 'og:description', content: description },
        { property: 'og:url', content: `${origin}/${shop.slug}` },
        { name: 'twitter:card', content: 'summary_large_image' },
        ...(cover ? [{ property: 'og:image', content: `${origin}${imgUrl(cover)}` }] : []),
      ],
    }
  },
  notFoundComponent: () => (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 text-center">
      <p className="code text-[13px] text-muted">404</p>
      <h1 className="title mt-3 text-[30px]">This shop is not here</h1>
      <p className="mt-2 max-w-[30ch] text-[15px] leading-relaxed text-muted">Check the link for a typo, or ask the seller for their RIZK link.</p>
      <a href="/" className="btn mt-8">
        Go to RIZK
      </a>
    </div>
  ),
  component: ShopLayout,
})

function ShopLayout() {
  const { session } = Route.useRouteContext()
  const { shop } = Route.useLoaderData()
  // Set during render, before the pages below send their first event. Idempotent.
  if (session.shop?.id === shop.id) ignoreShop(shop.id)
  return <Outlet />
}
