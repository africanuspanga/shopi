import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthLayout, PasswordInput } from '#/components/auth'
import { ErrorText, Field, ShopAvatar, TextLink } from '#/components/ui'
import { logout } from '#/lib/api/session'
import { acceptInvite, getInvite } from '#/lib/api/staff'
import { useT } from '#/lib/i18n'
import { ROLE_FOR_YOU, ROLE_NAMES } from '#/lib/staff'

export const Route = createFileRoute('/join/$code')({
  loader: ({ params }) => getInvite({ data: { code: params.code } }),
  head: () => ({ meta: [{ title: 'Join a shop · Shopi' }, { name: 'robots', content: 'noindex' }] }),
  component: Join,
})

/**
 * The invite link a shop owner sends an assistant (roadmap `t-staff`): who invites them and as what, then a password
 * (a new login), the password of the login this number has, or one tap when that login is the one here.
 */
function Join() {
  const t = useT()
  const router = useRouter()
  const { code } = Route.useParams()
  const loaded = Route.useLoaderData()
  const invite = 'ok' in loaded ? (loaded as Extract<typeof loaded, { ok: true }>) : null
  const [form, setForm] = useState({ name: invite?.name ?? '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!invite) {
    const ended = 'error' in loaded ? loaded.error : 'ended'
    return (
      <AuthLayout>
        <h1 className="title text-32 md:text-40">{ended === 'limit' ? t('Too many tries') : t('This invite link has ended')}</h1>
        <p className="mt-2 text-15 leading-relaxed text-muted">
          {ended === 'limit'
            ? t('Wait an hour and open the link again.')
            : t('An invite link works once, for 7 days. Ask the shop’s owner to send you a new one from Shop assistants.')}
        </p>
        <Link to="/login" className="btn btn-lg mt-8 w-full">
          {t('Log in')}
        </Link>
      </AuthLayout>
    )
  }

  const shop = invite.shop.name
  const errors: Record<string, string> = {
    ended: t('This invite link has ended. Ask the shop’s owner to send you a new one.'),
    password: t('That password does not match this number’s Shopi login.'),
    short: t('Use at least 6 characters.'),
    busy: t('This number already runs a shop on Shopi, and one login runs one shop.'),
    limit: t('Too many tries. Wait an hour and try again, or message the Shopi team on WhatsApp.'),
    other_login: t('Log out first, then open the link again.'),
  }

  async function join() {
    setBusy(true)
    setError('')
    try {
      const res = await acceptInvite({ data: { code, name: form.name, password: form.password } })
      if ('error' in res) {
        setBusy(false)
        return setError(errors[res.error ?? ''] ?? t('Not saved. Check your connection and try again.'))
      }
      await router.invalidate()
      router.navigate({ to: '/app' })
    } catch {
      setBusy(false)
      setError(t('Not saved. Check your connection and try again.'))
    }
  }

  return (
    <AuthLayout>
      <div className="flex items-center gap-3">
        <ShopAvatar name={shop} logo={invite.shop.logo_key} className="h-12 w-12 text-15" />
        <div className="min-w-0">
          <p className="truncate text-15 font-semibold">{shop}</p>
          <p className="meta truncate">shopi.tz/{invite.shop.slug}</p>
        </div>
      </div>
      <h1 className="title mt-6 text-32 md:text-40">{t('Help run {shop}', { shop })}</h1>
      <p className="mt-2 text-15 leading-relaxed text-muted">{t('{owner} added you as a shop assistant on Shopi.', { owner: invite.owner })}</p>

      <div className="mt-6 rounded-20 bg-card p-5">
        <p className="text-14 text-muted">{t('Your role')}</p>
        <p className="mt-1 text-15 font-semibold">{t(ROLE_NAMES[invite.role])}</p>
        <p className="mt-1 text-14 leading-relaxed text-ink-2">{t(ROLE_FOR_YOU[invite.role])}</p>
      </div>

      {invite.me && !invite.me.match ? (
        // Someone else is logged in on this phone: accepting would mix two logins.
        <div className="mt-8">
          <p className="text-15 leading-relaxed">{t('You are logged in as {name} on this phone. Log out to accept this invite.', { name: invite.me.name })}</p>
          <button
            type="button"
            className="btn btn-lg mt-6 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await logout()
              await router.invalidate()
              setBusy(false)
            }}
          >
            {t('Log out')}
          </button>
        </div>
      ) : invite.account === 'busy' ? (
        <div className="mt-8">
          <ErrorText>{t('This number already runs a shop on Shopi, and one login runs one shop. Ask {owner} to add another number of yours.', { owner: invite.owner })}</ErrorText>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void join()
          }}
        >
          <Field label={t('Your number')}>
            <input className="input code bg-page text-ink-2" value={invite.phone} readOnly aria-readonly />
          </Field>
          {invite.me?.match ? null : invite.account === 'new' ? (
            <>
              <Field label={t('Your name')}>
                <input className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label={t('Choose a password')} hint={t('At least 6 characters. You log in with your number and this password.')}>
                <PasswordInput autoComplete="new-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
              </Field>
            </>
          ) : (
            <Field label={t('Your password')} hint={t('This number already has a Shopi login. Use its password.')}>
              <PasswordInput autoComplete="current-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
            </Field>
          )}
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-lg w-full" disabled={busy || (!invite.me?.match && !form.password) || (invite.account === 'new' && !form.name.trim())}>
            {busy ? t('Joining') : t('Join {shop}', { shop })}
          </button>
          {invite.account === 'existing' && !invite.me?.match && (
            <p className="text-14 text-muted">{t('Forgot your password? Message the Shopi team on WhatsApp and we will reset it.')}</p>
          )}
        </form>
      )}
      <p className="mt-8 text-13 leading-relaxed text-muted">
        {t('Not expecting this? Close this page; nothing happens.')} <TextLink to="/privacy">{t('Privacy')}</TextLink>
      </p>
    </AuthLayout>
  )
}
