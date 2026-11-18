import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthLayout, PasswordInput } from '#/components/auth'
import { ErrorText, Field, TextLink } from '#/components/ui'
import { signup } from '#/lib/api/session'
import { useT } from '#/lib/i18n'
import { useHumanCheck } from '#/lib/turnstile'
import { canonical } from '#/lib/seo'

export const Route = createFileRoute('/signup')({
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: context.session.shop ? '/app' : '/onboard' })
  },
  head: () => ({ meta: [{ title: 'Open your shop · Shopi' }], links: [canonical('/signup')] }),
  component: Signup,
})

function Signup() {
  const t = useT()
  const router = useRouter()
  const [form, setForm] = useState({ name: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const check = useHumanCheck('signup')
  const errors = {
    name: t('Enter your name.'),
    phone: t('That phone number looks wrong. Example: 0754 123 456'),
    password: t('Use at least 6 characters for the password.'),
    exists: t('This number already has a shop. Log in instead.'),
    limit: t('Too many tries. Wait an hour and try again, or message the Shopi team on WhatsApp.'),
    bot: t('We couldn’t check that you’re not a robot. Wait a minute and try again.'),
  }
  return (
    <AuthLayout
      topRight={
        <Link to="/login" className="text-14 font-medium text-ink-2 transition-colors hover:text-ink">
          {t('Log in')}
        </Link>
      }
    >
      <h1 className="title text-32 md:text-40">{t('Open your shop')}</h1>
      <p className="mt-2 text-15 text-muted">{t('First, your account. Your shop comes next.')}</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const human = await check.token()
          if (human === null) {
            setBusy(false)
            return setError(t('Tap the box above to show you’re not a robot, then try again.'))
          }
          const res = await signup({ data: { ...form, human } })
          setBusy(false)
          if ('error' in res && res.error) return setError(errors[res.error])
          await router.invalidate()
          router.navigate({ to: '/onboard' })
        }}
      >
        <Field label={t('Your name')}>
          <input className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t('Phone number')} hint={t('You log in with this number')}>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0754 123 456" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={t('Password')} hint={t('At least 6 characters')}>
          <PasswordInput autoComplete="new-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
        </Field>
        <div ref={check.slot} />
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-lg w-full" disabled={busy}>
          {busy ? t('Creating your account') : t('Continue')}
        </button>
        <p className="text-13 leading-relaxed text-muted">
          {t('By continuing you agree to the')} <TextLink to="/terms">{t('Terms')}</TextLink> {t('and')}{' '}
          <TextLink to="/privacy">{t('Privacy')}</TextLink>.
        </p>
      </form>
      <p className="mt-8 text-14 text-muted">
        {t('Already have a shop?')} <TextLink to="/login">{t('Log in')}</TextLink>
      </p>
    </AuthLayout>
  )
}
