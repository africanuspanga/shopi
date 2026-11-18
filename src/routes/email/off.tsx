import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { EmailPage } from '#/components/email'
import { ErrorText } from '#/components/ui'
import { stopEmail } from '#/lib/api/email'
import { useT } from '#/lib/i18n'

/**
 * From a link in an email: stop the weekly summary, or remove the address ("Not you? Remove this address"). One tap on
 * this page, no log-in (the link's key is the proof); a scanner opening the link changes nothing.
 */
export const Route = createFileRoute('/email/off')({
  validateSearch: (s: Record<string, unknown>): { u?: string; k?: string; w?: string } => ({
    u: typeof s.u === 'string' ? s.u : undefined,
    k: typeof s.k === 'string' ? s.k : undefined,
    w: s.w === 'news' || s.w === 'all' || s.w === 'remove' ? s.w : 'weekly',
  }),
  head: () => ({ meta: [{ title: 'Email from Shopi · Shopi' }, { name: 'robots', content: 'noindex' }] }),
  component: Off,
})

function Off() {
  const t = useT()
  const { u, k, w } = Route.useSearch()
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const remove = w === 'remove'
  const what = w === 'news' ? t('News from Shopi') : w === 'all' ? t('All optional email from Shopi') : t('The weekly summary')
  return (
    <EmailPage>
      {done ? (
        <>
          <h1 className="title text-[28px]">{remove ? t('Removed') : t('Stopped')}</h1>
          <p className="mt-2 text-[15px] leading-6 text-ink-2">
            {remove
              ? t('This address is off the shop, and Shopi sends nothing more to it.')
              : t('{what} stops. Receipts and reminders about your plan still come. You can change this in Shop settings.', { what })}
          </p>
          {!remove && (
            <Link to="/app/shop" className="btn btn-ghost btn-lg mt-6 w-full">
              {t('Open Shop settings')}
            </Link>
          )}
        </>
      ) : (
        <>
          <h1 className="title text-[28px]">{remove ? t('Remove this address?') : t('Stop this email?')}</h1>
          <p className="mt-2 text-[15px] leading-6 text-ink-2">
            {remove ? t('Someone added this email to a shop on Shopi. If it isn’t yours, remove it and Shopi won’t write to it again.') : what}
          </p>
          <div className="mt-5">
            <ErrorText>{error}</ErrorText>
          </div>
          <button
            type="button"
            className="btn btn-lg mt-1 w-full"
            disabled={busy || !u || !k}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                const r = await stopEmail({ data: { u: u ?? '', k: k ?? '', w: w ?? 'weekly' } })
                if (r.ok) setDone(true)
                else setError(remove ? t('This address is already off the shop.') : t('This link doesn’t work any more. Change your email choices in Shop settings.'))
              } catch {
                setError(t('Something went wrong. Try again.'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {remove ? t('Remove it') : t('Stop it')}
          </button>
        </>
      )}
    </EmailPage>
  )
}
