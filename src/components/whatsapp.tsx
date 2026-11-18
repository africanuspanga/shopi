import { Check, Copy, Phone } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { localPhone } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { inAppBrowser } from '#/lib/push'

/**
 * Opening a WhatsApp chat from a buyer page (checkout v2, 17 Nov 2026). Every button stays a plain `wa.me` link, so
 * long-press and copy still work. On a phone the tap opens it in the same tab: some in-app browsers (TikTok's, older
 * Instagram ones) do nothing for a link that wants a new tab. On Android inside Instagram, TikTok or Facebook the tap
 * asks Android for WhatsApp directly (an `intent:` link), with `wa.me` as the fallback. Desktop keeps the new tab
 * (WhatsApp Web). The order never depends on this: it is saved before any chat opens.
 */
export function openWhatsApp(e: MouseEvent<HTMLElement>) {
  const href = (e.currentTarget as HTMLAnchorElement).href
  if (!href) return
  const ua = navigator.userAgent
  if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return
  e.preventDefault()
  window.location.href = /Android/i.test(ua) && inAppBrowser() ? intentLink(href) : href
}

/** wa.me/<number>?text=… as an Android intent for any app that opens `whatsapp:` (WhatsApp or WhatsApp Business). */
function intentLink(href: string) {
  const url = new URL(href)
  const phone = url.pathname.replace(/\D/g, '')
  const q = new URLSearchParams()
  if (phone) q.set('phone', phone)
  const text = url.searchParams.get('text')
  if (text) q.set('text', text)
  return `intent://send?${q.toString()}#Intent;scheme=whatsapp;S.browser_fallback_url=${encodeURIComponent(href)};end`
}

/** A WhatsApp button's tap handler, and whether it was tapped (to show `WhatsAppHelp` under it). */
export function useWhatsApp(after?: () => void) {
  const [tapped, setTapped] = useState(false)
  return {
    tapped,
    onClick: (e: MouseEvent<HTMLElement>) => {
      after?.()
      setTapped(true)
      openWhatsApp(e)
    },
  }
}

/**
 * Under a WhatsApp button once it was tapped: what to do if WhatsApp didn't open. The number with Copy and Call, the
 * message to copy, and inside Instagram or TikTok the way out to the phone's browser.
 */
export function WhatsAppHelp({ show, phone, text, onSand = false }: { show: boolean; phone: string; text?: string; onSand?: boolean }) {
  const t = useT()
  const [copied, setCopied] = useState<'' | 'number' | 'message'>('')
  if (!show) return null
  const copy = async (what: 'number' | 'message', value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      /* clipboard blocked: the number is on screen to read */
    }
  }
  const local = localPhone(phone)
  const small = 'btn btn-ghost btn-sm h-9 px-3 text-13'
  return (
    <div className={`fade mt-3 rounded-16 p-4 text-13 leading-5 ${onSand ? 'bg-card shadow-[inset_0_0_0_1px_var(--color-line)]' : 'bg-page'}`}>
      <p className="font-medium text-ink">{t('WhatsApp didn’t open?')}</p>
      <p className="mt-0.5 text-muted">{t('Message this number from your WhatsApp, or call.')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="code mr-1 text-14 text-ink">{local}</span>
        <button type="button" className={small} onClick={() => copy('number', local.replace(/\s/g, ''))}>
          {copied === 'number' ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={1.75} />}
          {copied === 'number' ? t('Copied') : t('Copy')}
        </button>
        <a href={`tel:${phone}`} className={small}>
          <Phone size={14} strokeWidth={1.75} /> {t('Call')}
        </a>
        {text && (
          <button type="button" className={small} onClick={() => copy('message', text)}>
            {copied === 'message' ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={1.75} />}
            {copied === 'message' ? t('Copied') : t('Copy message')}
          </button>
        )}
      </div>
      {typeof navigator !== 'undefined' && inAppBrowser() && (
        <p className="mt-3 text-muted">{t('In Instagram or TikTok: tap ⋯ at the top, then Open in browser, and try again.')}</p>
      )}
    </div>
  )
}
