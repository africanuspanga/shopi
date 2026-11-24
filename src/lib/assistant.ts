import { msg, type T } from '#/lib/i18n'
import { tzs, type OptionKind, type OrderStatus } from '#/lib/format'

/**
 * The AI assistant for buyers (roadmap `ai-buyer`, built 23 Nov 2026), the parts the browser and the server share.
 * The server is `src/server/assistant.ts`, the sheet `src/components/assistant.tsx`, the seller's page
 * `src/routes/app/assistant.tsx`.
 *
 * The founder's rule: it is only an assistant and must not be invasive. It never opens by itself, never pops up, nudges
 * or covers the products; the buyer chooses to ask. It answers from the shop's own facts only, and the buyer confirms
 * anything it does.
 */

/** A buyer's question, at most this long. */
export const ASK_MAX = 300
/** Questions in one chat; then the buyer starts a new one or asks the seller (the 10 Nov spec: about 10 turns). */
export const CHAT_QUESTIONS = 20
/** Chats are deleted this long after their last message (Privacy page). */
export const CHAT_DAYS = 90

/** A product or a service the answer shows as a card the buyer can open. */
export type AskCard = { kind: 'product' | 'service'; id: string }

/** What an answer offers. Nothing happens until the buyer taps it. */
export type AskAction =
  /** Put this product (and option) in the bag: a card with a button. */
  | { type: 'bag'; product: string; option: string | null }
  /** Message the seller on WhatsApp, with the question written in. */
  | { type: 'whatsapp' }
  /** An order the buyer gave the code of: its page. */
  | { type: 'order'; code: string }

export type AskReply = { text: string; cards: AskCard[]; action: AskAction | null }

/** The questions a buyer can tap. The shop's data answers them, so they are instant and never counted. */
export type Quick = 'delivery' | 'pay' | 'hours' | 'where' | 'options' | 'stock' | 'order'
export const QUICKS: Quick[] = ['delivery', 'pay', 'hours', 'where', 'options', 'stock', 'order']

const OPTIONS_Q: Record<OptionKind, string> = {
  size: msg('What sizes are there?'),
  colour: msg('What colours are there?'),
  style: msg('What styles are there?'),
  model: msg('What models are there?'),
  flavour: msg('What flavours are there?'),
}

/** A tap-chip's words, which are also the buyer's question in the chat and in the seller's log. */
export function quickLabel(t: T, q: Quick, kind: OptionKind = 'size') {
  switch (q) {
    case 'delivery':
      return t('Where do you deliver?')
    case 'pay':
      return t('How do I pay?')
    case 'hours':
      return t('When are you open?')
    case 'where':
      return t('Where are you?')
    case 'options':
      return t(OPTIONS_Q[kind])
    case 'stock':
      return t('Is it in stock?')
    case 'order':
      return t('Where is my order?')
  }
}

/**
 * An order's status in the words of its own page (`/o/<code>`), so the assistant says no more and no less than that
 * page: the buyer who has the code can open it anyway.
 */
export function orderWords(t: T, o: { status: OrderStatus; lipa: boolean; shop: string; total: number }) {
  const head: Record<OrderStatus, [string, string]> = {
    awaiting_payment: [t('Pay to finish your order'), t('Send {total} to the Lipa Namba below, then paste the confirmation SMS.', { total: tzs(o.total) })],
    payment_claimed: [t('Payment sent. The seller is checking'), t('{shop} confirms your order once the money is in. This usually takes a few minutes.', { shop: o.shop })],
    confirmed: [
      o.lipa ? t('Payment confirmed') : t('Order confirmed'),
      o.lipa
        ? t('{shop} is getting your order ready.', { shop: o.shop })
        : t('{shop} is getting your order ready. Pay the rider {total} when it arrives.', { shop: o.shop, total: tzs(o.total) }),
    ],
    dispatched: [t('On the way to you'), t('Your order has left the shop. Keep your phone close for the rider.')],
    delivered: [t('Delivered'), t('Thank you for shopping with {shop}.', { shop: o.shop })],
    cancelled: [t('Order cancelled'), t('Message {shop} on WhatsApp if this is a mistake.', { shop: o.shop })],
  }
  // "Below" means the order page; in the chat the page is one tap away.
  const [title, sub] = head[o.status]
  return o.status === 'awaiting_payment' ? `${title}. ${t('Open your order to see the Lipa Namba and the amount, then paste the confirmation SMS there.')}` : `${title}. ${sub}`
}

/**
 * Phone numbers a buyer types are hidden before the question is stored or sent to the model (the roadmap: never send
 * buyers' phone numbers to the model). Tanzanian mobiles in any spacing, and any long run of digits.
 */
export function hidePhones(s: string, t: T) {
  const hidden = t('[number hidden]')
  return PHONES.reduce((out, re) => out.replace(new RegExp(re.source, 'g'), hidden), s)
}

/** A phone number in a text (the checks after the model: it has none to give). */
export const hasPhone = (s: string) => PHONES.some((re) => new RegExp(re.source).test(s))

// Separators people type between digits: spaces, dots, dashes, slashes; the area part may sit in brackets.
const PHONES = [
  // +255 / 255 / 00255, then a mobile (0754 123 456 written as +255 754 123 456, or +255 (0)754…)
  /(?:\+|00)?\s?255[\s.\-/]?\(?0?\)?[67]\d(?:[\s.\-/]?\d){7}(?!\d)/,
  // 0754 123 456, 0754.123.456, (0754) 123 456, 0754/123456
  /\(?\b0[67]\d{2}\)?(?:[\s.\-/]?\d){6}(?!\d)/,
  // landlines: 022 211 1234
  /\(?\b0[2-5]\d\)?[\s.\-/]?\d{3}[\s.\-/]?\d{4}(?!\d)/,
  // a mobile typed without its 0: 754 123 456
  /\b[67]\d{2}[\s.\-/]?\d{3}[\s.\-/]?\d{3}(?!\d)/,
  // any run of 10 or more digits
  /\b\d(?:[\s.\-/]?\d){9,}(?!\d)/,
]
