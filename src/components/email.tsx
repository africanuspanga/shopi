import { Link, useRouter } from '@tanstack/react-router'
import { Check, Mail } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ErrorText, Field, Notice, Sheet, Switch, Toast, Wordmark } from '#/components/ui'
import { getMyEmail, removeMyEmail, setEmailPrefs, setMyEmail } from '#/lib/api/email'
import { suggestEmail } from '#/lib/email'
import { useT } from '#/lib/i18n'

/*
 * The seller's email (roadmap `o-email`, decision n11): optional, asked on Home and in Shop settings, never at sign-up.
 * No confirm step (the founder, 18 Nov): it works once saved; a typo hint and a "Your email is set" email with "Not
 * you? Remove this address" stand in for one. Rules and sending: src/lib/email.ts, src/server/email.ts.
 */

type Mine = Awaited<ReturnType<typeof getMyEmail>>

/** The address and the weekly summary switch, then Save. A likely typo (gmial.com) is offered as a one-tap fix. */
export function EmailForm({ initial = '', weekly: weeklyStart = true, onSaved }: { initial?: string; weekly?: boolean; onSaved: (email: string) => void }) {
  const t = useT()
  const [email, setEmail] = useState(initial)
  const [weekly, setWeekly] = useState(weeklyStart)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fix = suggestEmail(email)
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        try {
          const res = await setMyEmail({ data: { email, weekly } })
          if ('error' in res)
            setError(
              res.error === 'email'
                ? t('That email looks wrong. Example: zee@gmail.com')
                : res.error === 'limit'
                  ? t('That is a lot of changes for one hour. Try again later.')
                  : t('Email isn’t open yet.'),
            )
          else onSaved(email.trim().toLowerCase())
        } catch {
          setError(t('Something went wrong. Try again.'))
        } finally {
          setBusy(false)
        }
      }}
    >
      <Field
        label={t('Your email')}
        hint={
          fix ? (
            <button type="button" className="text-left text-ink-2" onClick={() => setEmail(fix)}>
              {t('Did you mean')} <span className="font-medium text-ink underline decoration-line-strong underline-offset-4">{fix}</span>?
            </button>
          ) : (
            t('Optional. We never share it, and you can remove it in Shop settings.')
          )
        }
      >
        <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="zee@gmail.com" />
      </Field>
      <div className="rounded-16 bg-page p-4">
        <Switch label={t('A summary each Monday')} sub={t('Last week’s visits, orders and sales.')} checked={weekly} onChange={setWeekly} />
      </div>
      <ErrorText>{error}</ErrorText>
      <button className="btn w-full sm:w-auto" disabled={busy || !email.trim()}>
        <Mail size={16} strokeWidth={1.75} /> {busy ? t('Saving') : t('Save my email')}
      </button>
    </form>
  )
}

/** Shop settings: the address and the two choices. Hidden until email is open to this seller (EMAIL_LIVE). */
export function EmailSettings() {
  const t = useT()
  const [me, setMe] = useState<Mine | null>(null)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const load = () => getMyEmail().then(setMe).catch(() => setMe(null))
  useEffect(() => {
    load()
  }, [])
  const flash = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(''), 2600)
  }
  if (!me) return <p className="text-14 text-muted">{t('Loading')}</p>

  const prefs = async (p: { weekly?: boolean; news?: boolean }) => {
    setMe({ ...me, ...p })
    try {
      await setEmailPrefs({ data: p })
    } catch {
      setError(t('Something went wrong. Try again.'))
      load()
    }
  }

  if (!me.email || editing)
    return (
      <>
        <EmailForm
          initial={editing ? (me.email ?? '') : ''}
          weekly={me.email ? me.weekly : true}
          onSaved={(email) => {
            setEditing(false)
            load()
            flash(t('Saved. A short email is on its way to {email}.', { email }))
          }}
        />
        {editing && (
          <button type="button" className="mt-3 text-14 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink" onClick={() => setEditing(false)}>
            {t('Keep {email}', { email: me.email ?? '' })}
          </button>
        )}
        <Toast show={!!note}>{note}</Toast>
      </>
    )

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Check size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" />
        <div className="min-w-0">
          <p className="truncate text-15 font-medium">{me.email}</p>
          <p className="mt-0.5 text-14 leading-5 text-muted">{t('Your Tembo receipts and reminders come here.')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
          {t('Change')}
        </button>
        <button
          type="button"
          className="btn btn-sm bg-transparent text-bad hover:bg-bad/[0.06]"
          onClick={async () => {
            if (!window.confirm(t('Remove your email? Shopi stops sending you email.'))) return
            try {
              await removeMyEmail()
              setMe({ ...me, email: null, weekly: false, news: false })
            } catch {
              setError(t('Something went wrong. Try again.'))
            }
          }}
        >
          {t('Remove')}
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-4 border-t border-line pt-5">
        <Switch label={t('A summary each Monday')} sub={t('Last week’s visits, orders and sales.')} checked={me.weekly} onChange={(weekly) => prefs({ weekly })} />
        <div className="border-t border-line" />
        <Switch label={t('News from Shopi')} sub={t('New tools and tips, a few times a year.')} checked={me.news} onChange={(news) => prefs({ news })} />
      </div>
      <Toast show={!!note}>{note}</Toast>
    </div>
  )
}

const HIDE_KEY = 'shopi_email_row'
const HIDE_FOR = 30 * 86_400_000

/** Home: one quiet row while the seller has no email, until they add one or say "Not now" (30 days). */
export function EmailRow({ state, className = '' }: { state: { open: boolean; email: string | null }; className?: string }) {
  const t = useT()
  const router = useRouter()
  const [hidden, setHidden] = useState(true)
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  useEffect(() => {
    try {
      setHidden(Date.now() - Number(localStorage.getItem(HIDE_KEY) ?? 0) < HIDE_FOR)
    } catch {
      setHidden(false)
    }
  }, [])
  if (!state.open || hidden) return <Toast show={!!saved}>{saved}</Toast>
  if (state.email) return <Toast show={!!saved}>{saved}</Toast>

  return (
    <>
      <Notice
        className={className}
        icon={<Mail size={18} strokeWidth={1.75} />}
        title={t('Get your receipts by email')}
        sub={t('Tembo receipts, reminders, and a summary each Monday if you like.')}
        onClick={() => setOpen(true)}
        onDismiss={() => {
          try {
            localStorage.setItem(HIDE_KEY, String(Date.now()))
          } catch {
            /* storage blocked */
          }
          setHidden(true)
        }}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Get your receipts by email')}>
        <p className="-mt-1 mb-5 text-14 leading-5 text-muted">{t('Tembo receipts, renewal reminders, and a summary each Monday if you like.')}</p>
        <EmailForm
          onSaved={(email) => {
            setOpen(false)
            setSaved(t('Saved. A short email is on its way to {email}.', { email }))
            setTimeout(() => setSaved(''), 2600)
            router.invalidate()
          }}
        />
      </Sheet>
    </>
  )
}

/** The small page an email's links open (/email/off): the wordmark and one card. */
export function EmailPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-page px-4 py-10">
      <Link to="/" aria-label="Shopi">
        <Wordmark className="h-[22px] w-auto" />
      </Link>
      <main className="card mt-10 w-full max-w-[440px] p-6 md:p-8">{children}</main>
    </div>
  )
}
