import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { ShoppingBag } from 'lucide-react'
import { CheckoutHeader, CheckoutView, type CheckoutLine } from '#/components/checkout'
import { Empty } from '#/components/ui'
import { useCart } from '#/lib/cart'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/$shop/checkout')({ component: Checkout })
const parent = getRouteApi('/$shop')

function Checkout() {
  const t = useT()
  const navigate = useNavigate()
  const { shop, products, areas, paused, hasDiscounts } = parent.useLoaderData()
  const cart = useCart(shop.id)
  const lines: CheckoutLine[] = cart.lines.flatMap((l) => {
    const p = products.find((x) => x.id === l.productId)
    if (!p) return []
    return [
      {
        key: l.line,
        productId: p.id,
        name: p.name,
        image: p.images[0] ?? null,
        size: l.size,
        qty: l.qty,
        price: p.price,
        left: l.size ? (p.sizes?.find((s) => s.label === l.size)?.stock ?? null) : p.stock,
      },
    ]
  })

  if (lines.length === 0) {
    return (
      <div className="min-h-dvh bg-page">
        <CheckoutHeader shop={shop} />
        <main className="mx-auto max-w-[560px] px-4 pt-10">
          <Empty
            icon={<ShoppingBag size={20} strokeWidth={1.5} />}
            title={t('Your bag is empty')}
            body={t('Add something you like and it will wait for you here.')}
            action={
              <Link to="/$shop" params={{ shop: shop.slug }} className="btn">
                {t('Back to {shop}', { shop: shop.name })}
              </Link>
            }
          />
        </main>
      </div>
    )
  }

  return (
    <CheckoutView
      shop={shop}
      areas={areas}
      paused={paused}
      lines={lines}
      title={t('Checkout')}
      onQty={(key, qty) => cart.set(key, qty)}
      discounts={hasDiscounts}
      onPlaced={async (code) => {
        // Open the order page first: clearing the bag before would flash "your bag is empty".
        await navigate({ to: '/o/$code', params: { code } })
        cart.clear()
      }}
    />
  )
}
