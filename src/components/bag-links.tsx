import type { BagState } from '#/lib/api/bags'
import { msg, useT } from '#/lib/i18n'

const STATE: Record<BagState, { label: string; dot: string }> = {
  open: { label: msg('Waiting for the buyer'), dot: 'bg-wait' },
  used: { label: msg('Ordered'), dot: 'bg-ok' },
  expired: { label: msg('Ended'), dot: 'bg-faint' },
  cancelled: { label: msg('Cancelled'), dot: 'bg-faint' },
}

/** Where a bag link stands: a quiet dot and a label, like an order's status. */
export function BagPill({ state }: { state: BagState }) {
  const t = useT()
  const s = STATE[state]
  return (
    <span className={`inline-flex items-center gap-1.5 text-13 whitespace-nowrap ${state === 'open' || state === 'used' ? 'text-ink-2' : 'text-muted'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {t(s.label)}
    </span>
  )
}

/** "Ends in 6 days", "Ends in 5h", or "Ended". */
export function useEndsIn() {
  const t = useT()
  return (expires: number) => {
    const ms = expires - Date.now()
    if (ms <= 0) return t('Ended')
    const hours = Math.ceil(ms / 3600_000)
    if (hours < 24) return t('Ends in {n}h', { n: hours })
    const days = Math.round(ms / 86400_000)
    return t(days === 1 ? 'Ends in {n} day' : 'Ends in {n} days', { n: days })
  }
}
