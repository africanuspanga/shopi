/**
 * Email to sellers (roadmap `o-email`, decision n11; 18 Nov 2026). Safe in the browser.
 *
 * No confirm step (the founder, 18 Nov: most sellers in Tanzania rarely use email, so nothing must stand between them
 * and their receipts): an address works the moment it is saved. Two light guards instead: a typo hint while typing
 * (`suggestEmail`), and one short "Your email is set" email at once, with a one-tap "Not you? Remove this address".
 *
 * EMAIL_LIVE stays false until the founder has received each kind of email at their own address and is happy with how
 * it lands (inbox, not spam; DMARC on shopi.tz is p=reject). Until then only admins can add an email or receive one,
 * and /admin can send any kind as a test. Flip it in the same release that tells sellers about it.
 */
export const EMAIL_LIVE = false

/** Kinds of email. Essential ones (the address set, money, the plan ending) carry no unsubscribe link. */
export const EMAIL_KINDS = ['added', 'receipt', 'renewal', 'weekly'] as const
export type EmailKind = (typeof EMAIL_KINDS)[number]
export const OPTIONAL_KINDS: readonly EmailKind[] = ['weekly']

/** A plausible address: something@domain.tld, no spaces, at most 120 characters. Lower-cased by the caller. */
export const isEmail = (s: string) => s.length <= 120 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s)

/** Common slips in the domains people here use most, and what they meant. */
const SLIPS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'g.mail.com': 'gmail.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'icloud.con': 'icloud.com',
  'icoud.com': 'icloud.com',
}

/** "asha@gmial.com" → "asha@gmail.com", or null when the domain looks right. */
export function suggestEmail(raw: string) {
  const s = raw.trim().toLowerCase()
  const at = s.lastIndexOf('@')
  if (at < 1) return null
  const fix = SLIPS[s.slice(at + 1)]
  return fix ? `${s.slice(0, at)}@${fix}` : null
}
