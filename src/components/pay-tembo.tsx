import { useRouter } from '@tanstack/react-router'
import { Check, Copy, Phone, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ErrorText, Field, Sheet } from '#/components/ui'
import { payTembo, temboLipaNamba, temboPayment, temboPushAgain } from '#/lib/api/billing'
import { localPhone, normalizePhone, tzs } from '#/lib/format'
import { eg, useLang, useT } from '#/lib/i18n'
import { DAY, TEMBO_PRICE } from '#/lib/plans'

/**
 * Paying for Tembo (roadmap `o-tembo`), the screen CV Chap Chap's payment page taught us (src/app/(builder)/payment in
 * CV, read 18 Nov 2026): a PIN prompt to the seller's number; the order's own Lipa Namba printed at once under "Check
 * your phone"; after 15 s "Send the prompt again" and "Use another number"; after 60 s the full Lipa Namba card; a
 * declined prompt hands over a Lipa Namba instead of a dead end. The screen asks every 3 s; the server asks Selcom.
 * Closing it is safe: the cron finishes the payment and a notification says Tembo is on.
 */

const POLL_MS = 3000
/** A prompt that is coming has almost always landed by now. */
const FALLBACK_AFTER_MS = 15_000
/** Real payers took 22 s typically to enter a PIN, 57 s for the slowest tenth (CV): open Lipa Namba after a minute. */
const LIPA_AFTER_MS = 60_000
const RESEND_COOLDOWN_S = 20
/** About 5 minutes for a prompt, 15 once paying by hand. */
const MAX_POLLS = 100
const LIPA_MAX_POLLS = 300
/** How many times a closed Lipa Namba is replaced before giving up. */
const MAX_RENEWALS = 2

type Step =
  | { kind: 'form' }
  | { kind: 'waiting'; ref: string; phone: string }
  | { kind: 'lipa'; ref: string; lipa: string; amount: number; ussd: string; expiresAt: number }
  | { kind: 'paid'; ref: string; until: number | null }

type Lipa = { ref: string; lipa: string; amount: number; ussd: string; expiresAt: number }

export function PayTembo({ open, onClose, phone, currentUntil }: { open: boolean; onClose: () => void; phone: string; currentUntil: number | null }) {
  const t = useT()
  const router = useRouter()
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const paid = step.kind === 'paid'
  /** Payments the seller left (another number, or a sheet closed while waiting): kept while the plan page is open. */
  const prior = useRef<string[]>([])

  const close = () => {
    onClose()
    if (step.kind === 'waiting' || step.kind === 'lipa') prior.current = [step.ref, ...prior.current.filter((r) => r !== step.ref)].slice(0, 3)
    // The plan rides with the session: refresh it, in case a payment finished (here, or by the cron meanwhile).
    void router.invalidate()
    setStep({ kind: 'form' })
  }

  return (
    <Sheet open={open} onClose={close} title={paid ? undefined : t('Pay for Tembo')}>
      {open && <Flow step={step} setStep={setStep} prior={prior} phone={phone} currentUntil={currentUntil} onDone={close} />}
    </Sheet>
  )
}

function Flow({
  step,
  setStep,
  prior,
  phone: sellerPhone,
  currentUntil,
  onDone,
}: {
  step: Step
  setStep: (s: Step) => void
  prior: { current: string[] }
  phone: string
  currentUntil: number | null
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang()
  const [phone, setPhone] = useState(() => localPhone(sellerPhone))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** The reference a failed start left behind: Lipa Namba can still pay for it. */
  const [lipaFor, setLipaFor] = useState('')
  const [peek, setPeek] = useState<Lipa | null>(null)
  const [fallback, setFallback] = useState(false)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [cooldown, setCooldown] = useState(0)
  const polls = useRef(0)
  const renewals = useRef(0)
  const lipaBusy = useRef(false)
  // The step as it is now, for answers that arrive late (a Lipa Namba must never replace "Tembo is on").
  const stepRef = useRef(step)
  stepRef.current = step
  const leave = (ref: string) => {
    prior.current = [ref, ...prior.current.filter((r) => r !== ref)].slice(0, 3)
  }
  const nextUntil = Math.max(currentUntil ?? 0, Date.now()) + 365 * DAY

  // t() is a new function every render; the timers and the polling read these refs so they never restart.
  const tRef = useRef(t)
  tRef.current = t
  const failText = (code: string) => {
    const tt = tRef.current
    return code === 'balance'
      ? tt('Your mobile money balance is not enough. Top up, then try again.')
      : code === 'number'
        ? tt('That number was not accepted. Use a Tanzanian mobile money number, like 0754 123 456.')
        : code === 'unreachable'
          ? tt('The payment service did not answer. Try again in a moment.')
          : code === 'limit'
            ? tt('Too many tries for now. Wait a few minutes, then try again.')
            : code === 'closed'
              ? tt('Paying for Tembo opens soon')
              : tt('We could not start the payment. Try again.')
  }
  const failRef = useRef(failText)
  failRef.current = failText

  const openLipa = useCallback(
    async (ref: string) => {
      if (lipaBusy.current) return
      lipaBusy.current = true
      setError('')
      try {
        const r = await temboLipaNamba({ data: { ref } })
        if (stepRef.current.kind === 'paid') return
        if ('error' in r) {
          setError(failRef.current(r.error))
          setStep({ kind: 'form' })
        } else if (r.status === 'completed') setStep({ kind: 'paid', ref: r.ref, until: r.until })
        else {
          // A new order for the same year: the one it replaces is still checked now and then.
          if (r.ref !== ref) prior.current = [ref, ...prior.current.filter((x) => x !== ref)].slice(0, 3)
          polls.current = 0
          setStep({ kind: 'lipa', ...r })
        }
      } catch {
        setError(tRef.current('We could not start the payment. Try again.'))
      } finally {
        lipaBusy.current = false
      }
    },
    [setStep, prior],
  )

  const start = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    setLipaFor('')
    try {
      const r = await payTembo({ data: { phone } })
      if ('paid' in r) {
        // A payment the seller had left was paid meanwhile: no second year.
        setStep({ kind: 'paid', ref: r.ref ?? '', until: r.until ?? null })
      } else if ('ok' in r) {
        polls.current = 0
        renewals.current = 0
        setPeek(null)
        // `again`: a prompt went to this number a moment ago; that one is still the one to pay.
        setNotice('again' in r && r.again ? t('We sent a prompt to this number a moment ago. Pay that one, or send it again.') : '')
        setStep({ kind: 'waiting', ref: String(r.ref), phone: localPhone(normalizePhone(phone)) || phone })
      } else {
        setError(failText(r.error))
        if ('ref' in r && r.ref && r.error !== 'number') {
          setLipaFor(r.ref)
          // No answer may still mean a prompt went out: keep checking that payment.
          if (r.error === 'unreachable') leave(r.ref)
        }
      }
    } catch {
      setError(t('We could not start the payment. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  // Waiting for the PIN: the order's own Lipa Namba at once (only if it is this order's), the fallbacks after 15 s,
  // the full Lipa Namba card after a minute.
  const waitingRef = step.kind === 'waiting' ? step.ref : ''
  useEffect(() => {
    if (!waitingRef) return
    setFallback(false)
    setResend('idle')
    let live = true
    temboLipaNamba({ data: { ref: waitingRef } })
      .then((r) => live && 'status' in r && r.status === 'pending' && r.ref === waitingRef && setPeek(r))
      .catch(() => {})
    const a = setTimeout(() => live && setFallback(true), FALLBACK_AFTER_MS)
    const b = setTimeout(() => live && void openLipa(waitingRef), LIPA_AFTER_MS)
    return () => {
      live = false
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [waitingRef, openLipa])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Asking where the payment stands.
  const pollRef = step.kind === 'waiting' || step.kind === 'lipa' ? step.ref : ''
  const byHand = step.kind === 'lipa'
  useEffect(() => {
    if (!pollRef) return
    let live = true
    let id: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      live = false
      clearInterval(id)
    }
    const tick = async () => {
      // A Lipa Namba is on its way: its answer decides what comes next.
      if (!live || lipaBusy.current) return
      polls.current += 1
      if (polls.current > (byHand ? LIPA_MAX_POLLS : MAX_POLLS)) {
        stop()
        prior.current = [pollRef, ...prior.current.filter((x) => x !== pollRef)].slice(0, 3)
        setError(tRef.current('We didn’t receive a payment. Send the prompt again or pay with Lipa Namba.'))
        setLipaFor(pollRef)
        setStep({ kind: 'form' })
        return
      }
      try {
        // Every 5th tick, the payment the seller moved away from: it may still be paid.
        if (prior.current.length && polls.current % 5 === 0) {
          const ref = prior.current[0]
          const p = await temboPayment({ data: { ref } })
          if (!live) return
          if (p.status === 'completed') {
            stop()
            return setStep({ kind: 'paid', ref, until: p.until })
          }
          if (p.status !== 'pending') prior.current.shift()
        }
        const s = await temboPayment({ data: { ref: pollRef } })
        if (!live) return
        if (s.status === 'completed') {
          stop()
          setStep({ kind: 'paid', ref: pollRef, until: s.until })
        } else if (s.status === 'failed') {
          // Stop asking: a failed row answers at once, and the next ticks would spend the renewals.
          stop()
          // A declined or expired prompt, or a Lipa Namba whose order closed: a (new) number, not a dead end.
          if (renewals.current < MAX_RENEWALS) {
            renewals.current += 1
            setNotice(byHand ? tRef.current('That Lipa Namba has closed. Use this new one.') : tRef.current('The prompt was not completed. You can still pay with Lipa Namba.'))
            void openLipa(pollRef)
          } else {
            setError(tRef.current('The payment did not go through. Try again.'))
            setStep({ kind: 'form' })
          }
        }
      } catch {
        // A dropped connection: the next tick tries again.
      }
    }
    const first = setTimeout(tick, 2000)
    id = setInterval(tick, POLL_MS)
    return () => {
      stop()
      clearTimeout(first)
    }
  }, [pollRef, byHand, openLipa, setStep, prior])

  const sendAgain = async () => {
    if (step.kind !== 'waiting' || resend === 'sending' || cooldown > 0) return
    setResend('sending')
    try {
      const r = await temboPushAgain({ data: { ref: step.ref } })
      if ('ok' in r) {
        polls.current = 0
        setResend('sent')
      } else setResend('error')
    } catch {
      setResend('error')
    }
    setCooldown(RESEND_COOLDOWN_S)
  }

  const anotherNumber = () => {
    if (step.kind === 'waiting' || step.kind === 'lipa') leave(step.ref)
    setPeek(null)
    setNotice('')
    setError('')
    setPhone('')
    setStep({ kind: 'form' })
  }

  if (step.kind === 'paid') return <Paid ref_={step.ref} until={step.until ?? nextUntil} onDone={onDone} />

  if (step.kind === 'waiting')
    return (
      <div>
        {notice && <p className="mb-4 rounded-14 bg-moto-soft px-4 py-3 text-14 text-moto-ink">{notice}</p>}
        <div className="flex flex-col items-center px-2 pt-2 text-center">
          <span className="relative flex size-16 items-center justify-center rounded-full bg-well">
            <Smartphone size={24} strokeWidth={1.75} />
            <span className="signal absolute top-3 right-3.5" />
          </span>
          <h3 className="title mt-4 text-20">{t('Check your phone')}</h3>
          <p className="mt-2 max-w-[34ch] text-15 leading-relaxed text-ink-2">
            {t('Enter your PIN on {phone} to pay {amount}.', { phone: step.phone, amount: nb(tzs(TEMBO_PRICE)) })}
          </p>
        </div>

        {peek && (
          <p className="mt-6 rounded-16 bg-page px-4 py-3.5 text-14 leading-relaxed text-ink-2">
            <LipaLine ussd={peek.ussd} lipa={peek.lipa} />
          </p>
        )}

        {fallback && (
          <div className="rise mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button type="button" className="btn btn-ghost sm:flex-1" onClick={sendAgain} disabled={resend === 'sending' || cooldown > 0}>
              {resend === 'sending'
                ? t('Sending')
                : cooldown > 0
                  ? resend === 'sent'
                    ? t('Sent. Again in {n}s', { n: cooldown })
                    : t('Send again in {n}s', { n: cooldown })
                  : t('Send the prompt again')}
            </button>
            <button type="button" className="btn btn-quiet sm:flex-1" onClick={() => void openLipa(step.ref)}>
              {t('Pay with Lipa Namba')}
            </button>
          </div>
        )}
        {resend === 'error' && <p className="mt-3 text-center text-13 text-bad">{t('The prompt could not be sent. Pay with Lipa Namba instead.')}</p>}

        <Foot onAnother={fallback ? anotherNumber : undefined} />
      </div>
    )

  if (step.kind === 'lipa')
    return (
      <div>
        {notice && <p className="mb-4 rounded-14 bg-moto-soft px-4 py-3 text-14 text-moto-ink">{notice}</p>}
        <LipaCard lipa={step.lipa} amount={step.amount} ussd={step.ussd} />
        <p className="mt-5 text-13 leading-relaxed text-muted">
          {t('Use it before {time}. This number is for this payment only.', { time: clock(step.expiresAt) })}
        </p>
        <Foot onAnother={anotherNumber} />
      </div>
    )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void start()
      }}
      className="space-y-5"
    >
      <Slip rows={[[t('Tembo, 1 year'), tzs(TEMBO_PRICE)], [t('Tembo until'), longDate(nextUntil, lang)]]} total={tzs(TEMBO_PRICE)} />
      <Field label={t('Mobile money number')} hint={t('The payment prompt comes to this phone. It can be any mobile money number.')}>
        <input
          className="input font-mono"
          inputMode="tel"
          autoComplete="tel"
          placeholder={eg(t, '0754 123 456')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-lg w-full" disabled={busy || !phone.trim()}>
        {busy ? t('Sending the prompt') : t('Pay {amount}', { amount: tzs(TEMBO_PRICE) })}
      </button>
      {lipaFor && (
        <button type="button" className="btn btn-ghost w-full" onClick={() => void openLipa(lipaFor)}>
          {t('Pay with Lipa Namba instead')}
        </button>
      )}
      <p className="text-center text-13 leading-5 text-muted">{t('Paid to Driftmark Technologies, the company behind Shopi. Once a year, no commission on your sales.')}</p>
    </form>
  )
}

/** The bottom of the waiting and Lipa Namba steps. */
function Foot({ onAnother }: { onAnother?: () => void }) {
  const t = useT()
  return (
    <div className="mt-6 space-y-3 text-center">
      <p className="text-13 leading-5 text-muted">{t('You can close this. Tembo turns on by itself once the payment arrives.')}</p>
      {onAnother && (
        <button type="button" className="text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={onAnother}>
          {t('Use another number')}
        </button>
      )}
    </div>
  )
}

/** "No prompt? Pay with Lipa Namba: dial *150*50*1# and enter 1234 5678." */
function LipaLine({ ussd, lipa }: { ussd: string; lipa: string }) {
  const t = useT()
  const [a, b, c] = t('No prompt? Dial {ussd} and enter Lipa Namba {number}.').split(/\{ussd\}|\{number\}/)
  return (
    <>
      {a}
      <span className="font-mono font-medium text-ink">{ussd}</span>
      {b}
      <span className="font-mono font-medium text-ink">{group(lipa)}</span>
      {c}
    </>
  )
}

/** Money inside a sentence never breaks between TSh and the figure. */
const nb = (v: string) => v.replace(/ /g, '\u00a0')
const group = (v: string) => v.replace(/(\d{4})(?=\d)/g, '$1 ')
const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

/** Paying an order's own number by hand. On Android the dialler opens with the code; iPhones refuse * and # in links. */
function LipaCard({ lipa, amount, ussd }: { lipa: string; amount: number; ussd: string }) {
  const t = useT()
  const [android, setAndroid] = useState(false)
  useEffect(() => setAndroid(isAndroid()), [])
  return (
    <ol className="space-y-5">
      <LipaStep n={1} title={t('Dial {ussd}', { ussd })}>
        <div className="flex flex-wrap gap-2">
          {android && (
            <a className="btn btn-sm" href={`tel:${ussd.replace(/#/g, '%23')}`}>
              <Phone size={16} strokeWidth={1.75} /> {t('Open the dialler')}
            </a>
          )}
          <CopyButton value={ussd} />
        </div>
      </LipaStep>
      <LipaStep n={2} title={t('Enter this Lipa Namba')}>
        <Value text={group(lipa)} copy={lipa} />
      </LipaStep>
      <LipaStep n={3} title={t('Enter the amount')}>
        <Value text={String(amount)} copy={String(amount)} />
      </LipaStep>
      <LipaStep n={4} title={t('Check the name reads DRIFTMARK TECHNOLOGI, press 1, then enter your PIN')} />
    </ol>
  )
}

function LipaStep({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-13 text-white">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <p className="text-15 font-medium">{title}</p>
        {children}
      </div>
    </li>
  )
}

function Value({ text, copy }: { text: string; copy: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-14 bg-page py-2.5 pr-2.5 pl-4">
      <span className="font-mono text-20 font-medium tracking-wide">{text}</span>
      <CopyButton value={copy} />
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      /* clipboard blocked: the value is on screen to read */
    }
  }
  return (
    <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={copy}>
      {done ? <Check size={16} strokeWidth={2.25} /> : <Copy size={16} strokeWidth={1.75} />}
      {done ? t('Copied') : t('Copy')}
    </button>
  )
}

/** The money on a receipt slip: the design system's mark for anything about money. Sand inside the white sheet. */
function Slip({ rows, total }: { rows: [string, string][]; total?: string }) {
  const t = useT()
  return (
    <div className="receipt px-5 pt-5 pb-6" style={{ '--receipt-bg': 'var(--color-page)' } as CSSProperties}>
      <div className="space-y-2.5 text-14">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-ink-2">{label}</span>
            <span className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">{value}</span>
          </div>
        ))}
      </div>
      {total && (
        <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
          <span className="text-15 font-medium">{t('Total')}</span>
          <span className="font-mono text-20 font-medium tracking-tight">{total}</span>
        </div>
      )}
    </div>
  )
}

function Paid({ ref_, until, onDone }: { ref_: string; until: number; onDone: () => void }) {
  const t = useT()
  const lang = useLang()
  return (
    <div className="pt-2">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-ok/10 text-ok">
          <Check size={24} strokeWidth={2.25} />
        </span>
        <h3 className="title mt-4 text-24">{t('Tembo is on')}</h3>
        <p className="mt-2 max-w-[34ch] text-15 leading-relaxed text-ink-2">{t('Thank you. Your shop has Tembo until {date}.', { date: longDate(until, lang) })}</p>
      </div>
      <div className="mt-6">
        <Slip rows={[[t('Tembo, 1 year'), tzs(TEMBO_PRICE)], [t('Paid until'), longDate(until, lang)], [t('Reference'), ref_]]} />
      </div>
      <button type="button" className="btn btn-lg mt-6 w-full" onClick={onDone}>
        {t('Done')}
      </button>
    </div>
  )
}

const longDate = (ms: number, lang: 'sw' | 'en') =>
  new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' })
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' })
