import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Wordmark } from '#/components/ui'
import { useT } from '#/lib/i18n'

export const LEGAL_UPDATED = '13 November 2026'

/** A plain reading page for Terms, Privacy and data deletion: sand page, one narrow column, links between them. */
export function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const t = useT()
  const links: [string, string][] = [
    ['/terms', t('Terms')],
    ['/privacy', t('Privacy')],
    ['/data-deletion', t('Delete your data')],
  ]
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="mx-auto flex h-16 max-w-[720px] items-center justify-between px-4 md:h-20 md:px-0">
        <Link to="/" aria-label="Shopi" className="flex h-9 items-center">
          <Wordmark className="h-[22px] w-auto" />
        </Link>
        <nav className="flex gap-4 text-[14px] text-ink-2">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className="hover:text-ink" activeProps={{ className: 'text-ink font-medium' }}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[720px] px-4 pt-6 pb-24 md:px-0 md:pt-12">
        <p className="meta text-muted">{t('Last updated {date}', { date: LEGAL_UPDATED })}</p>
        <h1 className="display mt-3 text-[40px] md:text-[56px]">{title}</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-2 md:text-[18px]">{lead}</p>
        <div className="mt-10 space-y-10">{children}</div>
        <p className="mt-16 border-t border-line pt-6 text-[14px] leading-relaxed text-muted">
          {t('Shopi is run by Driftmark Technologies Limited, Dar es Salaam, Tanzania. Questions: hello@shopi.tz')}
        </p>
      </main>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="title text-[22px] md:text-[26px]">{title}</h2>
      <div className="mt-3 space-y-3 text-[16px] leading-relaxed text-ink-2 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div>
    </section>
  )
}
