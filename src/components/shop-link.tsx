import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ErrorText, Field, Sheet } from '#/components/ui'
import { changeShopLink, checkShopLink } from '#/lib/api/merchant'
import { slugify } from '#/lib/format'
import { useT } from '#/lib/i18n'

/**
 * Shop settings, "Change your shop link" (the founder, 23 Nov 2026): the owner types a new link, sees at once whether
 * it is free, and saves. The old link is kept and sends buyers on to the new one (`shop_links`, the `$shop` route), so
 * a link in a bio, an old message or a printed QR code still opens the shop.
 */
export function ChangeLinkSheet({ open, onClose, slug, onChanged }: { open: boolean; onClose: () => void; slug: string; onChanged: (slug: string) => void }) {
  const t = useT()
  const [next, setNext] = useState(slug)
  const [state, setState] = useState<'same' | 'free' | 'short' | 'taken' | null>('same')
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Each time it opens it starts from the link of today.
  useEffect(() => {
    if (!open) return
    setNext(slug)
    setState('same')
    setError('')
  }, [open, slug])

  useEffect(() => {
    if (!open) return
    if (next === slug) return setState('same')
    if (next.length < 3) return setState('short')
    setChecking(true)
    let live = true
    const id = setTimeout(async () => {
      try {
        const res = await checkShopLink({ data: { slug: next } })
        if (live) setState(res.state)
      } catch {
        if (live) setState(null)
      }
      if (live) setChecking(false)
    }, 350)
    return () => {
      live = false
      clearTimeout(id)
      setChecking(false)
    }
  }, [next, slug, open])

  const status =
    state === 'same' ? (
      <span className="text-muted">{t('This is your link today.')}</span>
    ) : state === 'short' ? (
      <span className="text-muted">{t('At least 3 letters or numbers')}</span>
    ) : checking ? (
      <span className="flex items-center gap-1.5 text-muted">
        <Loader2 size={14} className="animate-spin" /> {t('Checking')}
      </span>
    ) : state === 'free' ? (
      <span className="flex items-center gap-1.5 text-ok">
        <Check size={14} strokeWidth={2.25} /> {t('Available')}
      </span>
    ) : state === 'taken' ? (
      <span className="flex items-center gap-1.5 text-bad">
        <X size={14} strokeWidth={2.25} /> {t('Taken. Try another')}
      </span>
    ) : null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || checking || state !== 'free') return
    setBusy(true)
    setError('')
    try {
      const res = await changeShopLink({ data: { slug: next } })
      if ('error' in res) {
        setError(
          res.error === 'many'
            ? t('This shop has changed its link several times. Write to hello@shopi.tz and we will change it for you.')
            : res.error === 'limit'
              ? t('You changed your link a few times today. Try again tomorrow.')
              : res.error === 'short'
                ? t('At least 3 letters or numbers')
                : t('That link is taken. Try another.'),
        )
        if (res.error === 'taken') setState('taken')
      } else {
        onChanged(res.slug)
      }
    } catch {
      setError(t('Something went wrong. Try again.'))
    }
    setBusy(false)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Change your shop link')}>
      <form onSubmit={save}>
        <Field label={t('New link')} hint={status}>
          <span className={`input flex items-center ${state === 'taken' && !checking ? 'shadow-[inset_0_0_0_1.5px_var(--color-bad)]' : ''}`}>
            <span className="text-muted">shopi.tz/</span>
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={next}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setNext(slugify(e.target.value, { typing: true }))
                setError('')
              }}
            />
          </span>
        </Field>
        <p className="mt-4 text-14 leading-relaxed text-muted">
          {t('Your old link keeps working: it takes buyers to the new one. Links in your bio, old messages and printed QR codes still open your shop.')}
        </p>
        {error && (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <button className="btn btn-lg mt-5 w-full" disabled={busy || checking || state !== 'free'}>
          {busy ? t('Saving') : t('Change my link')}
        </button>
      </form>
    </Sheet>
  )
}
