import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthLayout } from '#/components/auth'
import { logout } from '#/lib/api/session'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/paused')({
  beforeLoad: ({ context }) => {
    if (!context.session.user) throw redirect({ to: '/login' })
    if (!context.session.shop?.paused) throw redirect({ to: '/app' })
    return { shop: context.session.shop }
  },
  head: () => ({ meta: [{ title: 'Paused · Shopi' }, { name: 'robots', content: 'noindex' }] }),
  component: Paused,
})

/**
 * A shop assistant whose shop is no longer on Tembo (roadmap `t-staff`, the founder: "paused, kept"). Nothing is
 * deleted; the moment the shop renews, the seller app opens again as it was.
 */
function Paused() {
  const t = useT()
  const router = useRouter()
  const { shop } = Route.useRouteContext()
  const [busy, setBusy] = useState(false)
  return (
    <AuthLayout>
      <h1 className="title text-32 md:text-40">{t('Paused for now')}</h1>
      <p className="mt-2 text-15 leading-relaxed text-muted">
        {t('{shop} is back on Free, and shop assistants come with Tembo. You can help run it again as soon as the owner renews. Nothing was deleted.', { shop: shop.name })}
      </p>
      <button
        type="button"
        className="btn btn-lg mt-8 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await router.invalidate()
          await router.navigate({ to: '/app' })
          setBusy(false)
        }}
      >
        {t('Check again')}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-lg mt-3 w-full"
        onClick={async () => {
          await logout()
          await router.invalidate()
          router.navigate({ to: '/login' })
        }}
      >
        {t('Log out')}
      </button>
    </AuthLayout>
  )
}
