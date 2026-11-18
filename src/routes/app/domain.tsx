import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowUpRight, Check, Copy, Globe, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useHideFloatingNav } from '#/components/floating-nav'
import { TemboLock, useCan } from '#/components/tembo'
import { CardHead, ErrorText, Field, Page, TopBar } from '#/components/ui'
import { addDomain, checkDomain, getMyDomain, removeDomain } from '#/lib/api/domains'
import { splitDomain } from '#/lib/host'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/domain')({
  loader: () => getMyDomain(),
  head: () => ({ meta: [{ title: 'Your own domain · Shopi' }] }),
  component: DomainPage,
})

/** While a domain waits for the seller's DNS, the page asks again this often. */
const POLL = 30_000

function DomainPage() {
  // Connecting is Tembo; a shop that already has its domain keeps managing it (src/lib/plans.ts, the 31 Dec grace).
  const tembo = useCan('domain')
  const t = useT()
  const router = useRouter()
  const { ready, target, domain } = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<'' | 'add' | 'check' | 'remove'>('')
  const [error, setError] = useState<ReactNode>('')
  useHideFloatingNav(true)

  const pending = domain?.status === 'pending'
  useEffect(() => {
    if (!pending) return
    const id = setInterval(() => router.invalidate(), POLL)
    return () => clearInterval(id)
  }, [pending, router])

  async function connect(value = typed) {
    setBusy('add')
    setError('')
    const res = await addDomain({ data: { domain: value } }).catch(() => ({ error: 'fail' as const }))
    setBusy('')
    const err = 'error' in res ? res.error : undefined
    if (err) {
      if (err === 'apex' && 'suggest' in res && res.suggest) {
        const suggest = res.suggest
        return setError(
          <>
            {t('Use {www}: most domain sellers can’t point a bare name like {domain} here.', { www: suggest, domain: value.trim() })}{' '}
            <button type="button" className="font-medium underline underline-offset-4" onClick={() => (setTyped(suggest), connect(suggest))}>
              {t('Use {www}', { www: suggest })}
            </button>
          </>,
        )
      }
      return setError(
        {
          invalid: t('That doesn’t look like a domain. Example: www.yourshop.co.tz'),
          has: t('Your shop already has a domain. Remove it first.'),
          taken: t('Another shop uses that domain.'),
          limit: t('Too many tries today. Try again tomorrow.'),
          off: t('Own domains aren’t switched on yet.'),
          tembo: t('Your own domain is part of Tembo.'),
          fail: t('Something went wrong. Try again.'),
          apex: '',
        }[err],
      )
    }
    setTyped('')
    router.invalidate()
  }

  async function act(kind: 'check' | 'remove') {
    if (kind === 'remove' && !window.confirm(t('Disconnect {domain}? Your shop stays at shopi.tz/{slug}.', { domain: domain!.hostname, slug: shop.slug }))) return
    setBusy(kind)
    setError('')
    await (kind === 'check' ? checkDomain() : removeDomain()).catch(() => setError(t('Something went wrong. Try again.')))
    setBusy('')
    router.invalidate()
  }

  return (
    <Page wide>
      <TopBar back="/app/shop" title={t('Your own domain')} sub={t('Your shop at your own address, like www.yourshop.co.tz.')} />
      <div className="max-w-[720px] space-y-4">
        <ErrorText>{error}</ErrorText>

        {!ready && !domain && (
          <section className="card p-5 md:p-6">
            <Icon />
            <CardHead title={t('Own domains aren’t switched on yet')} className="mt-4" />
            <p className="mt-2 text-14 leading-relaxed text-muted">{t('Your shop works as always at shopi.tz/{slug}. This page will let you connect your domain once they are.', { slug: shop.slug })}</p>
          </section>
        )}

        {ready && !domain && !tembo && (
          <TemboLock
            title={t('Your own domain')}
            body={t('Buyers open your shop at your own address, like www.yourshop.co.tz, with your name in the link instead of Shopi’s. It is part of Tembo.')}
          />
        )}

        {ready && !domain && tembo && (
          <>
            <Step n={1} title={t('Buy a domain')}>
              <p className="text-14 leading-relaxed text-muted">{t('From a company that sells domains: a .co.tz from a Tanzanian registrar, or a .com. Shopi doesn’t sell domains.')}</p>
            </Step>
            <Step n={2} title={t('Connect it')}>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  connect()
                }}
              >
                <Field label={t('Your domain')} hint={t('Use the www. version. We show you how to send the bare name to it.')}>
                  <input className="input code" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="www.yourshop.co.tz" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" />
                </Field>
                <button className="btn mt-4" disabled={!typed.trim() || !!busy}>
                  {busy === 'add' && <Loader2 size={16} className="animate-spin" />} {t('Connect')}
                </button>
              </form>
            </Step>
          </>
        )}

        {domain && (
          <section className="card p-5 md:p-6">
            <div className="flex items-start gap-4">
              <Icon />
              <div className="min-w-0 flex-1">
                <p className="code truncate text-15">{domain.hostname}</p>
                <p className={`mt-1 flex items-center gap-2 text-14 ${domain.status === 'failed' ? 'text-bad' : 'text-ink-2'}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${domain.status === 'active' ? 'bg-ok' : domain.status === 'failed' ? 'bg-bad' : 'bg-wait'}`} />
                  {domain.status === 'active' ? t('Live') : domain.status === 'failed' ? t('Not connected') : t('Waiting for your DNS record')}
                </p>
              </div>
            </div>

            {domain.status === 'active' && (
              <div className="mt-5 space-y-3">
                <p className="text-14 leading-relaxed text-muted">{t('Your shop opens at this address. Put it in your bio; shopi.tz/{slug} keeps working too.', { slug: shop.slug })}</p>
                <a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                  {t('Open your shop')} <ArrowUpRight size={16} strokeWidth={1.75} />
                </a>
              </div>
            )}

            {domain.status !== 'active' && <DnsSteps host={domain.hostname} target={target} />}
            {domain.detail && domain.status !== 'active' && <p className="code mt-4 rounded-12 bg-page px-3 py-2 text-12 leading-5 text-muted">{domain.detail}</p>}

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              {domain.status !== 'active' && (
                <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => act('check')}>
                  {busy === 'check' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={1.75} />}
                  {domain.status === 'failed' ? t('Try again') : t('Check now')}
                </button>
              )}
              <button type="button" className="btn btn-sm bg-transparent text-bad hover:bg-bad/[0.06]" disabled={!!busy} onClick={() => act('remove')}>
                {t('Disconnect')}
              </button>
              {domain.checked_at && domain.status === 'pending' && <span className="meta ml-auto">{t('Checks by itself every few minutes')}</span>}
            </div>
          </section>
        )}
      </div>
    </Page>
  )
}

function Icon() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
      <Globe size={20} strokeWidth={1.75} />
    </span>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card p-5 md:p-6">
      <CardHead icon={<span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-13 text-white">{n}</span>} title={title} />
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** The one record the seller adds where they bought the domain, with copy buttons, and how to send the bare name on. */
function DnsSteps({ host, target }: { host: string; target: string }) {
  const t = useT()
  const [apex, name] = splitDomain(host)
  return (
    <div className="mt-5 space-y-4">
      <p className="text-14 leading-relaxed text-ink-2">{t('Where you bought the domain, open its DNS settings and add this record:')}</p>
      <dl className="divide-y divide-line rounded-16 bg-page">
        <Row label={t('Type')} value="CNAME" />
        <Row label={t('Name')} value={name} copy />
        <Row label={t('Points to')} value={target} copy />
      </dl>
      <p className="text-13 leading-5 text-muted">
        {t('It usually works within minutes and can take up to a day. To make {apex} open your shop too, turn on forwarding from {apex} to https://{host} in the same place.', { apex, host })}
      </p>
    </div>
  )
}

function Row({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  const t = useT()
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <dt className="w-24 shrink-0 text-13 text-muted">{label}</dt>
      <dd className="code min-w-0 flex-1 text-14 break-all">{value}</dd>
      {copy && (
        <button
          type="button"
          className="icon-btn h-9 w-9"
          aria-label={t('Copy {what}', { what: label })}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setDone(true)
              setTimeout(() => setDone(false), 1500)
            })
          }}
        >
          {done ? <Check size={16} strokeWidth={2.25} /> : <Copy size={16} strokeWidth={1.75} />}
        </button>
      )}
    </div>
  )
}
