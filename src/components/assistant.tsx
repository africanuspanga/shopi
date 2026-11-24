import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowUp, Check, ChevronRight, MessageCircleQuestion, ReceiptText, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { Price, shownPrice } from '#/components/shop'
import { serviceMeta } from '#/components/booking'
import { WhatsAppHelp, openWhatsApp } from '#/components/whatsapp'
import { Img, Sheet } from '#/components/ui'
import { track, visit } from '#/lib/analytics'
import { askAssistant, noteChat } from '#/lib/api/assistant'
import type { PublicProduct, PublicShop } from '#/lib/api/store'
import type { PublicService } from '#/lib/api/booking'
import { ASK_MAX, quickLabel, type AskAction, type AskCard, type Quick } from '#/lib/assistant'
import { servicePrice } from '#/lib/booking'
import { lineKey, useCart } from '#/lib/cart'
import { optionKind, optionText, priceOf, tzs, waLink } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { useHumanCheck } from '#/lib/turnstile'

/**
 * The AI assistant for buyers (roadmap `ai-buyer`; rules in `src/lib/assistant.ts`, answers in `src/server/assistant.ts`).
 *
 * The founder's rule: it never opens by itself, never pops up, nudges or covers the products. It opens only from a
 * button the buyer taps (`AskButton`, `AskLink`, the Info and Search sheets), through `openAssistant`. One
 * `AssistantHost` per shop (in the shop's layout) keeps the chat while the buyer moves between the shop's pages, and
 * the browser keeps it for the visit (sessionStorage). Anything it does (the bag, WhatsApp) the buyer taps.
 */

const EVENT = 'shopi:ask'
type Open = { product?: string | null; text?: string }

/** Opens the shop's assistant: on a product, and with a question the buyer already typed (sent at once). */
export function openAssistant(o: Open = {}) {
  window.dispatchEvent(new CustomEvent<Open>(EVENT, { detail: o }))
}

type Msg = {
  id: string
  who: 'buyer' | 'ai'
  text: string
  cards?: AskCard[]
  action?: AskAction | null
  /** The product the question was about (for WhatsApp's message). */
  product?: string | null
  pending?: boolean
  error?: boolean
}
type Saved = { chat: string | null; msgs: Msg[]; ended: boolean }

const store = (shopId: string) => `shopi_ask_${shopId}`
const empty: Saved = { chat: null, msgs: [], ended: false }

function load(shopId: string): Saved {
  try {
    const s = JSON.parse(sessionStorage.getItem(store(shopId)) ?? 'null') as Saved | null
    return s && Array.isArray(s.msgs) ? { ...s, msgs: s.msgs.filter((m) => !m.pending) } : empty
  } catch {
    return empty
  }
}

let seq = 0
const mid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`

/** The chat, held by the host so an answer that arrives after the sheet closed is kept, and kept for the visit. */
type ChatState = {
  saved: Saved
  save: (next: Saved) => void
  /** The latest chat at once, for code that runs after an await. */
  current: () => Saved
  /** Bumped by "New chat": an answer to a question from before it is dropped. */
  gen: { current: number }
  busy: boolean
  setBusy: (b: boolean) => void
}

/** The shop's assistant: listens for `openAssistant` and holds the chat. Renders nothing until the buyer opens it. */
export function AssistantHost({ shop, products, services }: { shop: PublicShop; products: PublicProduct[]; services: PublicService[] }) {
  const [open, setOpen] = useState(false)
  const [about, setAbout] = useState<string | null>(null)
  const [first, setFirst] = useState<string | null>(null)
  const [saved, setSaved] = useState<Saved>(empty)
  const [busy, setBusy] = useState(false)
  const latest = useRef<Saved>(empty)
  const loaded = useRef(false)
  const gen = useRef(0)
  const save = useCallback(
    (next: Saved) => {
      latest.current = next
      setSaved(next)
      try {
        sessionStorage.setItem(store(shop.id), JSON.stringify({ ...next, msgs: next.msgs.filter((m) => !m.pending).slice(-40) }))
      } catch {
        /* storage blocked: the chat still works until the page closes */
      }
    },
    [shop.id],
  )
  useEffect(() => {
    const on = (e: Event) => {
      const o = (e as CustomEvent<Open>).detail ?? {}
      // The browser's storage is read on the first open (the server never has it).
      if (!loaded.current) {
        loaded.current = true
        latest.current = load(shop.id)
        setSaved(latest.current)
      }
      setAbout(o.product && products.some((p) => p.id === o.product) ? o.product : null)
      setFirst(o.text?.trim() ? o.text.trim().slice(0, ASK_MAX) : null)
      setOpen(true)
    }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [products, shop.id])
  if (!open) return null
  const chat: ChatState = { saved, save, current: () => latest.current, gen, busy, setBusy }
  return <AssistantSheet shop={shop} products={products} services={services} chat={chat} about={about} setAbout={setAbout} first={first} onFirst={() => setFirst(null)} onClose={() => setOpen(false)} />
}

function AssistantSheet({
  shop,
  products,
  services,
  chat,
  about,
  setAbout,
  first,
  onFirst,
  onClose,
}: {
  shop: PublicShop
  products: PublicProduct[]
  services: PublicService[]
  chat: ChatState
  about: string | null
  setAbout: (id: string | null) => void
  first: string | null
  onFirst: () => void
  onClose: () => void
}) {
  const t = useT()
  const { saved, save, busy, setBusy } = chat
  const [text, setText] = useState('')
  // The bot check runs for a new chat, and again when the server asks for it every few questions.
  const check = useHumanCheck('ask')
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const product = about ? products.find((p) => p.id === about) : undefined
  const kind = optionKind(product?.option_name)

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [saved.msgs.length, busy])

  // Laptops: straight into the box. Phones keep the keyboard down, so the questions to tap stay in view.
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) input.current?.focus()
  }, [])

  async function send(words: string | null, quick: Quick | null) {
    if (busy || chat.current().ended) return
    const asked = quick ? quickLabel(t, quick, kind) : (words ?? '').trim().slice(0, ASK_MAX)
    if (!asked) return
    setText('')
    setBusy(true)
    const g = chat.gen.current
    const stale = () => g !== chat.gen.current
    const buyer: Msg = { id: mid(), who: 'buyer', text: asked, product: about }
    const waiting: Msg = { id: mid(), who: 'ai', text: '', pending: true }
    const before = chat.current()
    save({ ...before, msgs: [...before.msgs, buyer, waiting] })
    const fail = (why: string) => {
      if (stale()) return
      const now = chat.current()
      save({ ...now, msgs: now.msgs.map((m) => (m.id === waiting.id ? { ...m, pending: false, error: true, text: why } : m)) })
      setBusy(false)
    }
    let id = before.chat
    let fresh = !id
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const human = fresh ? await check.token() : ''
        if (human === null) return fail(t('Tap the box above to show you’re not a robot, then try again.'))
        const res = await askAssistant({
          data: { shopId: shop.id, chat: id, text: quick ? '' : asked, quick, product: about, vid: safeVid(), human: human ?? '' },
        })
        if (stale()) return
        if ('error' in res) {
          // A chat the server no longer has (90 days, another device): start a new one. A fresh bot check asked for.
          if (res.error === 'chat' && attempt < 2) {
            id = null
            fresh = true
            continue
          }
          if (res.error === 'check' && attempt < 2) {
            fresh = true
            continue
          }
          return fail(
            res.error === 'bot' || res.error === 'check'
              ? t('We couldn’t check that you’re not a robot. Wait a minute and try again.')
              : res.error === 'busy'
                ? t('Too many questions in a short time. Try again in a few minutes, or ask the seller on WhatsApp.')
                : res.error === 'off'
                  ? t('The assistant is off for this shop. Ask the seller on WhatsApp.')
                  : t('Something went wrong. Try again.'),
          )
        }
        const now = chat.current()
        save({
          chat: res.chat,
          ended: res.ended,
          msgs: now.msgs.map((m) =>
            m.id === buyer.id ? { ...m, text: res.asked || m.text } : m.id === waiting.id ? { ...m, pending: false, text: res.reply.text, cards: res.reply.cards, action: res.reply.action } : m,
          ),
        })
        setBusy(false)
        return
      }
    } catch {
      fail(t('Something went wrong. Check your connection and try again.'))
    }
  }

  // A question the buyer typed in Search, sent as soon as the sheet is open.
  useEffect(() => {
    if (!first) return
    onFirst()
    void send(first, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first])

  function startAgain() {
    chat.gen.current++
    setBusy(false)
    save(empty)
  }

  const quicks: Quick[] = product
    ? [product.sizes?.length ? 'options' : 'stock', ...(shop.serves ? [] : (['delivery'] as Quick[])), 'pay']
    : [...(shop.serves ? [] : (['delivery'] as Quick[])), 'pay', ...(shop.hours ? (['hours'] as Quick[]) : shop.location ? (['where'] as Quick[]) : []), ...(shop.serves ? [] : (['order'] as Quick[]))]
  const msgs = saved.msgs

  return (
    <Sheet
      open
      tall
      onClose={onClose}
      title={t('AI assistant')}
      head={
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-13 text-muted">
            {shop.serves ? t('Answers from {shop}’s details. It isn’t the business.', { shop: shop.name }) : t('Answers from {shop}’s details. It isn’t the seller.', { shop: shop.name })}
          </p>
          {msgs.length > 0 && (
            <button type="button" className="min-h-11 shrink-0 text-13 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={startAgain}>
              {t('New chat')}
            </button>
          )}
        </div>
      }
    >
      <div ref={list} className="-mx-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 md:-mx-6 md:px-6" aria-live="polite">
        <div className="space-y-3">
          <Bubble who="ai">
            {shop.serves ? t('Ask about services, prices, where it is or how to pay.') : t('Ask about products, sizes, prices, delivery or how to pay.')}{' '}
            {shop.whatsapp ? (shop.serves ? t('For anything else, the business answers on WhatsApp.') : t('For anything else, the seller answers on WhatsApp.')) : ''}
          </Bubble>
          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {quicks.map((q) => (
                <button key={q} type="button" className="chip" onClick={() => send(null, q)} disabled={busy}>
                  {quickLabel(t, q, kind)}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <Message key={m.id} m={m} question={m.who === 'ai' ? [...msgs.slice(0, i)].reverse().find((x) => x.who === 'buyer') : undefined} shop={shop} products={products} services={services} chat={saved.chat} onLeave={onClose} />
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-line pt-3">
        <div ref={check.slot} />
        {saved.ended ? (
          <div className="flex items-center justify-between gap-3 rounded-16 bg-page px-4 py-3">
            <p className="text-14 text-ink-2">{t('This chat is long. Start a new one, or ask the seller on WhatsApp.')}</p>
            <button type="button" className="btn btn-sm shrink-0" onClick={startAgain}>
              {t('New chat')}
            </button>
          </div>
        ) : (
          <>
            {product && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex h-8 min-w-0 items-center gap-2 rounded-full bg-page pr-1 pl-1 text-13 text-ink-2">
                  <Img size="thumb" k={product.images[0]} alt="" className="h-6 w-6 shrink-0 rounded-full" />
                  <span className="truncate">{t('About {product}', { product: product.name })}</span>
                  <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-raised" aria-label={t('Ask about the whole shop')} onClick={() => setAbout(null)}>
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </span>
              </div>
            )}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                // Nothing typed: the box is where to start (the button never greys out for that, DESIGN.md).
                if (!text.trim()) return input.current?.focus()
                void send(text, null)
              }}
            >
              <label className="input flex min-w-0 flex-1 items-center px-4">
                <input
                  ref={input}
                  type="text"
                  enterKeyHint="send"
                  maxLength={ASK_MAX}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={product ? t('Ask about {product}', { product: product.name }) : t('Ask a question')}
                  aria-label={t('Your question')}
                />
              </label>
              <button type="submit" className="btn h-12 w-12 shrink-0 px-0" disabled={busy} aria-label={t('Send')}>
                <ArrowUp size={20} strokeWidth={2.25} />
              </button>
            </form>
            <p className="mt-2 text-13 text-muted">{shop.serves ? t('AI can be wrong. You book a time on the service’s own page.') : t('AI can be wrong. The seller confirms every order.')}</p>
          </>
        )}
      </div>
    </Sheet>
  )
}

function safeVid() {
  try {
    return visit().vid
  } catch {
    return null
  }
}

function Bubble({ who, children, error = false }: { who: 'buyer' | 'ai'; children: ReactNode; error?: boolean }) {
  return (
    <div className={`flex ${who === 'buyer' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-20 px-4 py-2.5 text-15 leading-relaxed break-words ${
          who === 'buyer' ? 'bg-ink text-white' : error ? 'bg-page text-bad' : 'bg-page text-ink'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

function Message({
  m,
  question,
  shop,
  products,
  services,
  chat,
  onLeave,
}: {
  m: Msg
  /** The buyer's question this answers. */
  question?: Msg
  shop: PublicShop
  products: PublicProduct[]
  services: PublicService[]
  chat: string | null
  onLeave: () => void
}) {
  const t = useT()
  if (m.who === 'buyer') return <Bubble who="buyer">{m.text}</Bubble>
  if (m.pending) {
    return (
      <div className="flex justify-start">
        <div className="rounded-20 bg-page px-4 py-2.5 text-15 text-muted">{t('Looking at the shop’s details…')}</div>
      </div>
    )
  }
  const cards = (m.cards ?? []).filter((c) => (c.kind === 'product' ? products.some((p) => p.id === c.id) : services.some((v) => v.id === c.id)))
  return (
    <div className="space-y-2">
      <Bubble who="ai" error={m.error}>
        {m.text}
      </Bubble>
      {cards.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-16 shadow-[inset_0_0_0_1px_var(--color-line)]">
          {cards.map((c) => (
            <li key={c.id}>
              {c.kind === 'product' ? (
                <ProductRow p={products.find((p) => p.id === c.id)!} shopSlug={shop.slug} onLeave={onLeave} />
              ) : (
                <ServiceRow v={services.find((v) => v.id === c.id)!} shopSlug={shop.slug} onLeave={onLeave} />
              )}
            </li>
          ))}
        </ul>
      )}
      {m.action?.type === 'bag' && <BagOffer shop={shop} products={products} product={m.action.product} option={m.action.option} chat={chat} onLeave={onLeave} />}
      {m.action?.type === 'whatsapp' && shop.whatsapp && <SellerButton shop={shop} products={products} question={question} chat={chat} />}
      {m.action?.type === 'order' && (
        <a href={`/o/${m.action.code}`} className="btn btn-ghost btn-sm">
          <ReceiptText size={16} strokeWidth={1.75} /> {t('Open your order')}
        </a>
      )}
    </div>
  )
}

function ProductRow({ p, shopSlug, onLeave }: { p: PublicProduct; shopSlug: string; onLeave: () => void }) {
  const t = useT()
  return (
    <Link to="/$shop/$product" params={{ shop: shopSlug, product: p.slug ?? p.id }} onClick={onLeave} className="flex items-center gap-3 bg-card px-3 py-2.5 transition-colors hover:bg-page">
      <Img size="thumb" k={p.images[0]} alt={p.name} className="h-14 w-11 shrink-0 rounded-12" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-15">{p.name}</span>
        {p.stock === 0 ? <span className="block text-13 text-muted">{t('Sold out')}</span> : <Price p={shownPrice(p)} />}
      </span>
      <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
    </Link>
  )
}

function ServiceRow({ v, shopSlug, onLeave }: { v: PublicService; shopSlug: string; onLeave: () => void }) {
  const t = useT()
  return (
    <Link to="/$shop/book/$id" params={{ shop: shopSlug, id: v.id }} onClick={onLeave} className="flex items-center gap-3 bg-card px-3 py-2.5 transition-colors hover:bg-page">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-15">{v.name}</span>
        <span className="block truncate text-13 text-muted">{[serviceMeta(t, v), servicePrice(t, v)].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="btn btn-shop btn-sm h-9 shrink-0 px-4 text-white">{t('Book')}</span>
    </Link>
  )
}

/** "Put it in my bag": the assistant only offers; this button is the buyer's yes. */
function BagOffer({ shop, products, product, option, chat, onLeave }: { shop: PublicShop; products: PublicProduct[]; product: string; option: string | null; chat: string | null; onLeave: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const cart = useCart(shop.id)
  const [added, setAdded] = useState(false)
  const p = products.find((x) => x.id === product)
  if (!p) return null
  const o = option ? p.sizes?.find((s) => s.label === option) : undefined
  // Sold out since the answer: say so instead of offering it.
  const gone = p.stock === 0 || (!!option && (!o || o.stock === 0))
  const price = priceOf(p, option)
  function add() {
    cart.add(lineKey(p!.id, option), 1)
    track('add_to_cart', { shopId: shop.id, productId: p!.id, detail: 'assistant' })
    if (chat) void noteChat({ data: { chat, what: 'bag' } }).catch(() => {})
    setAdded(true)
  }
  return (
    <div className="flex items-center gap-3 rounded-16 p-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <Img size="thumb" k={(o?.image ?? p.images[0]) || null} alt={p.name} className="h-16 w-13 shrink-0 rounded-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-15 font-medium">{p.name}</p>
        <p className="truncate text-13 text-muted">{[option ? optionText(t, p.option_name, option) : '', tzs(price)].filter(Boolean).join(' · ')}</p>
        <div className="mt-2">
          {gone ? (
            <p className="text-13 text-muted">{t('Sold out')}</p>
          ) : added ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-14 font-medium">
                <Check size={16} strokeWidth={2.25} className="text-ok" /> {t('In your bag')}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onLeave()
                  void navigate({ to: '/$shop/checkout', params: { shop: shop.slug } })
                }}
              >
                {t('Checkout')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-shop btn-sm" onClick={add}>
              {t('Put it in my bag')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** The seller on WhatsApp, with the buyer's question already written in (they see it before sending). */
function SellerButton({ shop, products, question, chat }: { shop: PublicShop; products: PublicProduct[]; question?: Msg; chat: string | null }) {
  const t = useT()
  const [tapped, setTapped] = useState(false)
  const p = question?.product ? products.find((x) => x.id === question.product) : undefined
  const hello = p ? t('Hi {shop}, I am asking about {product} ({price})', { shop: shop.name, product: p.name, price: tzs(p.price) }) : t('Hi {shop}, I found your shop on Shopi.', { shop: shop.name })
  // The question goes in as the buyer wrote it, unless a number in it was hidden: they type that again themselves.
  const message = question?.text && !question.text.includes(t('[number hidden]')) ? `${hello}\n${question.text}` : hello
  return (
    <div>
      <a
        className="btn btn-sm"
        href={waLink(shop.whatsapp, message)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          track('whatsapp_click', { shopId: shop.id, productId: p?.id, detail: 'assistant' })
          if (chat) void noteChat({ data: { chat, what: 'whatsapp' } }).catch(() => {})
          setTapped(true)
          openWhatsApp(e)
        }}
      >
        <WhatsAppMark size={18} /> {t('Ask the seller on WhatsApp')}
      </a>
      <WhatsAppHelp show={tapped} phone={shop.whatsapp} text={message} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------- the ways in

/** The shop page's button, beside WhatsApp and Share. */
export function AskButton({ className = '' }: { className?: string }) {
  const t = useT()
  return (
    <button type="button" className={`btn btn-ghost btn-sm h-10 px-4 ${className}`} onClick={() => openAssistant()}>
      <MessageCircleQuestion size={16} strokeWidth={1.75} /> <span className="sm:hidden">{t('Ask')}</span>
      <span className="hidden sm:inline">{t('Ask a question')}</span>
    </button>
  )
}

/** A product page's quiet link, beside "Ask about this on WhatsApp". */
export function AskLink({ product }: { product: string }) {
  const t = useT()
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-2 text-14 font-medium underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
      onClick={() => openAssistant({ product })}
    >
      <MessageCircleQuestion size={18} strokeWidth={1.75} /> {t('Ask the AI assistant')}
    </button>
  )
}
