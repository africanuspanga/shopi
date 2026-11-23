import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthLayout, PasswordInput } from '#/components/auth'
import { ErrorText, Field, TextLink } from '#/components/ui'
import { login } from '#/lib/api/session'
import { eg, useT } from '#/lib/i18n'
import { canonical } from '#/lib/seo'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: context.session.shop ? '/app' : '/onboard' })
  },
  head: () => ({ meta: [{ title: 'Log in · Shopi' }], links: [canonical('/login')] }),
  component: Login,
})

function Login() {
  const t = useT()
  const router = useRouter()
  const [form, setForm] = useState({ phone: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <AuthLayout
      topRight={
        <Link to="/signup" className="text-14 font-medium text-ink-2 transition-colors hover:text-ink">
          {t('Open a shop')}
        </Link>
      }
    >
      <h1 className="title text-32 md:text-40">{t('Log in to your shop')}</h1>
      <p className="mt-2 text-15 text-muted">{t('Use the phone number you signed up with.')}</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const res = await login({ data: form })
          setBusy(false)
          if ('error' in res)
            return setError(res.error === 'limit' ? t('Too many tries. Wait an hour and try again, or message the Shopi team on WhatsApp.') : t('That phone number and password do not match.'))
          await router.invalidate()
          router.navigate({ to: '/app' })
        }}
      >
        <Field label={t('Phone number')}>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder={eg(t, '0754 123 456')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={t('Password')}>
          <PasswordInput autoComplete="current-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-lg w-full" disabled={busy || !form.phone || !form.password}>
          {busy ? t('Logging in') : t('Log in')}
        </button>
      </form>
      <p className="mt-8 text-14 text-muted">
        {t('New to Shopi?')} <TextLink to="/signup">{t('Open a shop')}</TextLink>
      </p>
      <p className="mt-2 text-14 text-muted">{t('Forgot your password? Message the Shopi team on WhatsApp and we will reset it.')}</p>
    </AuthLayout>
  )
}
