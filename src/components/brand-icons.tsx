/** One-colour social marks, drawn to sit next to lucide icons at the same size and weight. */
type P = { size?: number; strokeWidth?: number; className?: string }

export function WhatsAppIcon({ size = 18, strokeWidth = 1.6, className = '' }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4.2 19.8 5.3 16A8.2 8.2 0 1 1 8.4 19l-4.2.8Z" />
      <path d="M9.2 8.6c.2-.5.6-.5.9-.5h.4c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.7l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.6c.2-.2.4-.2.7-.1l1.5.7c.2.1.3.3.3.5v.4c0 .4-.2.8-.6 1-.5.3-1.3.4-2.4 0a8.6 8.6 0 0 1-4.8-4.5c-.4-1.1-.2-2 .1-2.4Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function InstagramIcon({ size = 18, strokeWidth = 1.6, className = '' }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TikTokIcon({ size = 18, strokeWidth = 1.6, className = '' }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8" />
      <path d="M14 3.5c.4 2.6 2.2 4.4 5 4.6" />
    </svg>
  )
}

export function FacebookIcon({ size = 18, strokeWidth = 1.6, className = '' }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d="M14.5 20.5v-7.3h2.6l.4-3h-3V8.4c0-.9.3-1.5 1.5-1.5h1.6V4.2a20 20 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4.1v2.1H8.5v3h2.7v7.2" />
    </svg>
  )
}

/**
 * WhatsApp's own mark in its own green, for buttons that open a WhatsApp chat. Our buttons stay black or white;
 * only the mark carries WhatsApp's colour, the way sign-in buttons keep Google's or Apple's logo.
 */
export function WhatsAppMark({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M3.6 20.6 4.9 16A9 9 0 1 1 8.2 19.3L3.6 20.6Z" fill="#25D366" />
      <path
        d="M9.2 8.1c.2-.5.6-.5.9-.5h.4c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.7l-.5.6c.6 1.2 1.6 2.2 2.9 2.8l.6-.6c.2-.2.5-.2.7-.1l1.6.7c.2.1.3.3.3.5v.4c0 .4-.2.8-.6 1.1-.5.3-1.4.5-2.5 0a9 9 0 0 1-5-4.7c-.4-1.2-.2-2.1.1-2.6Z"
        fill="#fff"
      />
    </svg>
  )
}
