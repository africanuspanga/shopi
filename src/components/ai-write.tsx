import { Link } from '@tanstack/react-router'
import { ArrowRight, PenLine, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TemboPill } from '#/components/tembo'
import { getAiAllowance, writeProductDescription, writeShopBio } from '#/lib/api/ai'
import { useT } from '#/lib/i18n'
import { FREE_AI_MONTH } from '#/lib/plans'

type Allowance = Awaited<ReturnType<typeof getAiAllowance>>

/**
 * "Write it for me" under a product's description (roadmap `ai-desc`, 18 Nov 2026): the AI writes one in the shop's
 * language from the name, the options and whatever the seller typed (taken as facts, nothing invented). It fills the
 * field; nothing is saved until the seller saves, and Undo puts their words back. Free shops get FREE_AI_MONTH a month;
 * hidden entirely while Shopi has no AI key.
 */
export function WriteItForMe({ name, notes, option, options, onText }: { name: string; notes: string; option: string; options: string[]; onText: (text: string) => void }) {
  const t = useT()
  const [allow, setAllow] = useState<Allowance | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<string | null>(null)
  // What the AI wrote, so Undo only offers itself while the field still holds it.
  const written = useRef('')

  useEffect(() => {
    getAiAllowance()
      .then(setAllow)
      .catch(() => setAllow(null))
  }, [])

  if (!allow?.ready) return null
  const out = allow.left === 0

  const run = async () => {
    if (busy) return
    if (!name.trim()) return setError(t('Add the product’s name first.'))
    setBusy(true)
    setError('')
    try {
      const r = await writeProductDescription({ data: { name, notes, option, options } })
      if ('text' in r && r.text) {
        setUndo(notes)
        written.current = r.text
        onText(r.text)
        setAllow({ ...allow, left: r.left ?? null })
      } else if ('error' in r && r.error === 'limit') setAllow({ ...allow, left: 0 })
      else if ('error' in r && r.error === 'name') setError(t('Add the product’s name first.'))
      else if ('error' in r && r.error === 'busy') setError(t('That is a lot for one day. Try again tomorrow.'))
      else setError(t('It could not be written just now. Try again.'))
    } catch {
      setError(t('It could not be written just now. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (out)
    return (
      <div className="mt-3 rounded-[16px] bg-page p-4">
        <div className="flex items-center gap-2">
          <TemboPill />
          <p className="text-[14px] font-medium">{t('This month’s {n} AI descriptions are used', { n: FREE_AI_MONTH })}</p>
        </div>
        <p className="mt-1 text-[13px] leading-5 text-ink-2">{t('More come on the 1st. Tembo writes as many as you need.')}</p>
        <Link to="/app/plan" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          {t('See what Tembo adds')} <ArrowRight size={13} strokeWidth={1.75} />
        </Link>
      </div>
    )

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className="btn btn-sm btn-quiet" onClick={run} disabled={busy}>
          <PenLine size={15} strokeWidth={1.6} /> {busy ? t('Writing') : notes.trim() ? t('Write it from my notes') : t('Write it for me')}
        </button>
        {undo !== null && !busy && notes === written.current && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
            onClick={() => {
              onText(undo)
              setUndo(null)
            }}
          >
            <Undo2 size={13} strokeWidth={1.75} /> {t('Undo')}
          </button>
        )}
        {allow.left !== null && <span className="meta ml-auto">{t(allow.left === 1 ? '1 left this month' : '{n} left this month', { n: allow.left })}</span>}
      </div>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        {error || t('Uses the name, the options and what you typed. Check it before you save: it only knows what you told it.')}
      </p>
    </div>
  )
}

/**
 * "Write it for me" under the shop's line about itself (setup step 4, Shop settings): the AI writes one sentence in the
 * shop's language from its name, what it sells, where and its products; what the seller typed is taken as facts.
 * `ready`: whether Shopi has an AI key, when the screen already knows; otherwise it asks.
 */
export function WriteBio({ notes, onText, ready }: { notes: string; onText: (text: string) => void; ready?: boolean }) {
  const t = useT()
  const [on, setOn] = useState(ready ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<string | null>(null)
  const written = useRef('')

  useEffect(() => {
    if (ready !== undefined) return setOn(ready)
    getAiAllowance()
      .then((a) => setOn(a.ready))
      .catch(() => setOn(false))
  }, [ready])

  if (!on) return null

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const r = await writeShopBio({ data: { notes } })
      if ('text' in r && r.text) {
        setUndo(notes)
        written.current = r.text
        onText(r.text)
      } else if ('error' in r && r.error === 'limit') setError(t('That is enough for this month. Write it yourself, or try again on the 1st.'))
      else if ('error' in r && r.error === 'facts') setError(t('Type a few words about what you sell first, and Shopi writes the line from them.'))
      else setError(t('It could not be written just now. Try again.'))
    } catch {
      setError(t('It could not be written just now. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className="btn btn-sm btn-quiet" onClick={run} disabled={busy}>
          <PenLine size={15} strokeWidth={1.6} /> {busy ? t('Writing') : notes.trim() ? t('Write it from my notes') : t('Write it for me')}
        </button>
        {undo !== null && !busy && notes === written.current && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
            onClick={() => {
              onText(undo)
              setUndo(null)
            }}
          >
            <Undo2 size={13} strokeWidth={1.75} /> {t('Undo')}
          </button>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-5 text-muted">{error || t('Uses your shop’s name, what you sell, where you are and your products. Check it before you save.')}</p>
    </div>
  )
}
