import { Check, Link2, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { waLink } from '#/lib/format'
import { useT } from '#/lib/i18n'

/**
 * Three ways to send a link: a WhatsApp chat, the clipboard, or the phone's own share sheet when it has one.
 * With `phone`, WhatsApp opens the chat with that number instead of asking who to send it to.
 */
export function ShareActions({
  url,
  text,
  title,
  phone,
  onShared,
}: {
  url: string
  text: string
  title: string
  phone?: string
  onShared?: (how: 'whatsapp' | 'copy' | 'native') => void
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [native, setNative] = useState(false)
  useEffect(() => setNative(typeof navigator !== 'undefined' && !!navigator.share), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('', url)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
    onShared?.('copy')
  }

  return (
    <div className="flex gap-2">
      <a
        href={phone ? waLink(phone, `${text}\n${url}`) : `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
        target="_blank"
        rel="noreferrer"
        className="btn btn-sm h-11 flex-1 px-3"
        onClick={() => onShared?.('whatsapp')}
      >
        <WhatsAppMark size={18} /> WhatsApp
      </a>
      <button type="button" className="btn btn-ghost btn-sm h-11 flex-1 px-3" onClick={copy}>
        {copied ? <Check size={16} strokeWidth={2.25} /> : <Link2 size={16} strokeWidth={1.75} />}
        {copied ? t('Copied') : t('Copy link')}
      </button>
      {native && (
        <button
          type="button"
          className="btn btn-ghost btn-sm h-11 w-11 shrink-0 px-0"
          aria-label={t('More ways to share')}
          onClick={async () => {
            try {
              await navigator.share({ url, title, text })
              onShared?.('native')
            } catch {
              /* closed */
            }
          }}
        >
          <Share2 size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

/** A product link the way a person reads it: no https, just the shop and the product. */
export const prettyUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')
