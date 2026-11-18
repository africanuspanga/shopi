import { Link } from '@tanstack/react-router'
import { useEffect, type MouseEvent, type ReactNode } from 'react'

/**
 * The floating black capsule at the bottom of phone screens: the seller app, a shop, the landing page.
 * Five slots: two tabs, a white centre circle for the main action, two tabs. The current tab sits on a raised pill
 * with its icon in Moto. Phones only; desktop has its own navigation.
 */
export function FloatingNav({ label, children }: { label: string; children: ReactNode }) {
  useTypingFlag()
  return (
    <nav data-floating-nav aria-label={label} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
      <div className="pointer-events-auto mx-auto grid h-[68px] max-w-[440px] grid-cols-5 items-center gap-1 rounded-full bg-ink p-1.5 text-white shadow-[0_0_0_5px_rgb(10_10_10/0.06),0_20px_44px_-14px_rgb(10_10_10/0.6)] ring-1 ring-white/[0.14]">
        {children}
      </div>
    </nav>
  )
}

/**
 * On Android the page shrinks when the keyboard opens, so a bar fixed to the bottom jumps up and covers the field being
 * typed in. While a text field has focus, <body data-typing> is set and the capsule slides away (styles.css).
 */
function useTypingFlag() {
  useEffect(() => {
    const typing = (el: Element | null) =>
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(el.type)) ||
      (el instanceof HTMLElement && el.isContentEditable)
    const update = () => document.body.toggleAttribute('data-typing', typing(document.activeElement))
    const later = () => setTimeout(update, 0)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', later)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', later)
      document.body.removeAttribute('data-typing')
    }
  }, [])
}

/** A page with its own bottom bar (a save bar) hides the capsule while that bar shows. */
export function useHideFloatingNav(hide: boolean) {
  useEffect(() => {
    document.body.toggleAttribute('data-hide-nav', hide)
    return () => {
      document.body.removeAttribute('data-hide-nav')
    }
  }, [hide])
}

type Icon = (props: { size?: number; strokeWidth?: number; className?: string }) => ReactNode

/** Where a slot goes: a route (to), a page anchor or another site (href), or an action (onClick). */
type Target = { to?: string; params?: Record<string, string>; href?: string; onClick?: (e: MouseEvent<HTMLElement>) => void }

function Go({ target, className, label, current, children }: { target: Target; className: string; label?: string; current?: boolean; children: ReactNode }) {
  const aria = { 'aria-label': label, 'aria-current': current ? ('page' as const) : undefined }
  if (target.to)
    return (
      // Routes are passed as plain strings from several places; the router still checks them at runtime.
      <Link to={target.to as '/'} params={target.params as never} className={className} onClick={target.onClick} {...aria}>
        {children}
      </Link>
    )
  if (target.href) {
    const away = /^https?:/.test(target.href)
    return (
      <a href={target.href} className={className} onClick={target.onClick} {...(away ? { target: '_blank', rel: 'noreferrer' } : {})} {...aria}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" className={className} onClick={target.onClick} aria-label={label} aria-pressed={current}>
      {children}
    </button>
  )
}

export function NavTab({ icon: Icon, label, active = false, badge, ...target }: { icon: Icon; label: string; active?: boolean; badge?: ReactNode } & Target) {
  return (
    <Go
      target={target}
      current={active}
      className={`flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-full text-11 font-medium transition-colors duration-200 ${active ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),inset_0_1px_0_rgb(255_255_255/0.08)]' : 'text-white/55 active:text-white'}`}
    >
      <span className="relative">
        <Icon size={20} strokeWidth={active ? 2 : 1.6} className={active ? 'text-moto-lit' : ''} />
        {badge}
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
    </Go>
  )
}

/** The white circle in the middle: the one thing this screen is for (add a product, open the bag, open a shop). */
export function NavCenter({ icon: Icon, label, badge, ...target }: { icon: Icon; label: string; badge?: ReactNode } & Target) {
  return (
    <Go target={target} label={label} className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink transition-transform duration-150 active:scale-90">
      <Icon size={24} strokeWidth={2.25} />
      {badge}
    </Go>
  )
}

/** A count on a slot, in the signal colour: items in the bag, payments to check. */
export function NavCount({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="tnum absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-moto-lit px-1 text-11 font-semibold text-on-moto-lit ring-2 ring-ink">
      {n > 99 ? '99+' : n}
    </span>
  )
}
