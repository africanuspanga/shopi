import { createServerFn } from '@tanstack/react-start'
import { all, first, now, run } from '#/server/db'
import { currentUser, myShop, requireAdmin, requireShop } from '#/server/auth'
import { LIMITS, clientIp, take } from '#/server/limits'
import { isHuman } from '#/server/turnstile'
import { aiReady } from '#/server/ai'
import { shopPlan } from '#/server/plan'
import { answer, assistantOffEverywhere, assistantOpen, assistantShop, assistantUse, chatOf, checkedAt, keep, needsCheck, newChat, setAssistantOffEverywhere } from '#/server/assistant'
import { ASK_MAX, CHAT_QUESTIONS, QUICKS, hidePhones, type AskAction, type AskCard, type AskReply, type Quick } from '#/lib/assistant'
import { asLang, translate } from '#/lib/i18n'

/** The AI assistant for buyers (src/server/assistant.ts): the buyer's question, and the seller's switch and chats. */

const isId = (v: unknown, max = 40) => typeof v === 'string' && /^[a-z0-9_-]{1,}$/i.test(v) && v.length <= max

export type AskAnswer =
  | { chat: string; asked: string; reply: AskReply; ended: boolean }
  | { error: 'shop' | 'off' | 'bot' | 'busy' | 'empty' | 'chat' | 'check' }

/**
 * A buyer's question (or a tap-chip) to a shop's assistant. A new chat needs the bot check; after that the chat's id
 * (random, kept on the buyer's phone for the visit) is the key. Nothing is done for the buyer here: an answer offers
 * the bag or WhatsApp, and the buyer taps it.
 */
export const askAssistant = createServerFn({ method: 'POST' })
  .validator((d: { shopId: string; chat?: string | null; text?: string; quick?: string | null; product?: string | null; vid?: string | null; human?: string }) => ({
    shopId: String(d?.shopId ?? ''),
    chat: isId(d?.chat) ? String(d.chat) : null,
    text: String(d?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, ASK_MAX),
    quick: QUICKS.includes(d?.quick as Quick) ? (d.quick as Quick) : null,
    product: isId(d?.product) ? String(d.product) : null,
    vid: isId(d?.vid, 64) ? String(d.vid) : null,
    human: typeof d?.human === 'string' ? d.human : '',
  }))
  .handler(async ({ data }): Promise<AskAnswer> => {
    if (!isId(data.shopId)) return { error: 'shop' }
    if (!data.text && !data.quick) return { error: 'empty' }
    const d = await assistantShop(data.shopId)
    if (!d) return { error: 'shop' }
    if (!assistantOpen(d.shop, d.off)) return { error: 'off' }
    // Floods only: phones in Tanzania share carrier IPs.
    const ip = clientIp()
    if (!(await take(`ask-ip:${d.shop.id}:${ip}`, LIMITS.askIp)) || !(await take(`ask-ip-all:${ip}`, LIMITS.askIpAll))) return { error: 'busy' }
    if (!(await take(`ask-shop:${d.shop.id}`, LIMITS.askShop)) || !(await take('ask-all', LIMITS.askAll))) return { error: 'busy' }

    let chat = data.chat ? await chatOf(data.chat, d.shop.id) : null
    if (data.chat && !chat) return { error: 'chat' }
    const lang = asLang(d.shop.lang)
    if (chat && chat.questions >= CHAT_QUESTIONS) {
      return { chat: chat.id, asked: '', ended: true, reply: { text: translate(lang, 'This chat is long. Start a new one, or ask the seller on WhatsApp.'), cards: [], action: d.shop.whatsapp ? { type: 'whatsapp' } : null } }
    }
    if (!chat) {
      if (!(await isHuman(data.human, 'ask', { key: `ask:${d.shop.id}`, limit: LIMITS.uncheckedAsk }))) return { error: 'bot' }
      // The seller (or their assistant) trying it on their own shop: marked "You" in the log, not counted.
      const user = await currentUser()
      const own = !!user && (await myShop(user.id))?.id === d.shop.id
      const product = data.product && d.products.some((p) => p.id === data.product) ? data.product : null
      // Without a token (Cloudflare unreachable, an old phone) the chat gets only a few questions before a real check.
      chat = await newChat(d.shop.id, { visitor: data.vid, product, own, lang, checked: !!data.human })
    } else if (needsCheck(chat)) {
      // The bot check again every few questions, so one check doesn't buy a script a whole chat. The browser sends a
      // fresh token when asked ('check').
      if (!data.human) return { error: 'check' }
      if (!(await isHuman(data.human, 'ask', { key: `ask:${d.shop.id}`, limit: LIMITS.uncheckedAsk }))) return { error: 'bot' }
      await checkedAt(chat.id, chat.questions)
      chat = { ...chat, checked_q: chat.questions }
    }

    const productId = data.product && d.products.some((p) => p.id === data.product) ? data.product : null
    const r = await answer({ d, chatId: chat.id, text: hidePhones(data.text, (en) => translate(lang, en)), quick: data.quick, productId, own: chat.own })
    await keep(chat.id, d.shop.id, r, productId)
    return { chat: chat.id, asked: r.asked, reply: r.reply, ended: chat.questions + 1 >= CHAT_QUESTIONS }
  })

/** What the buyer did with an answer: put the product in the bag, or opened WhatsApp (the seller's log shows it). */
export const noteChat = createServerFn({ method: 'POST' })
  .validator((d: { chat: string; what: string }) => ({ chat: isId(d?.chat) ? String(d.chat) : '', what: d?.what === 'bag' ? 'bag' : d?.what === 'whatsapp' ? 'whatsapp' : '' }))
  .handler(async ({ data }) => {
    if (!data.chat || !data.what) return { ok: false }
    await run(`UPDATE chats SET ${data.what === 'bag' ? 'bag' : 'whatsapp'} = 1 WHERE id = ?`, data.chat)
    return { ok: true }
  })

// ---------------------------------------------------------------------------------------------- the seller's page

export type ChatRow = {
  id: string
  first: string
  questions: number
  bag: number
  whatsapp: number
  own: number
  product: string | null
  lang: string
  created_at: number
  updated_at: number
}

const PAGE = 30

/** The seller's page: the switch, this month's use and the chats, newest first (`before`: older ones). */
export const getAssistantPage = createServerFn({ method: 'GET' })
  .validator((d: { before?: number } | undefined) => ({ before: Number(d?.before) > 0 ? Number(d!.before) : null }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('manage')
    const [row, plan, off] = await Promise.all([
      first<{ assistant: number }>('SELECT assistant FROM shops WHERE id = ?', shop.id),
      shopPlan(shop.id),
      assistantOffEverywhere(),
    ])
    const use = await assistantUse(shop.id, plan ?? { kind: 'free' })
    const chats = await all<ChatRow>(
      `SELECT c.id, c.questions, c.bag, c.whatsapp, c.own, c.lang, c.created_at, c.updated_at, p.name product,
         (SELECT text FROM chat_messages m WHERE m.chat_id = c.id AND m.role = 'buyer' ORDER BY m.id LIMIT 1) first
       FROM chats c LEFT JOIN products p ON p.id = c.product_id
       WHERE c.shop_id = ? AND c.questions > 0 ${data.before ? 'AND c.updated_at < ?' : ''}
       ORDER BY c.updated_at DESC LIMIT ${PAGE + 1}`,
      shop.id,
      ...(data.before ? [data.before] : []),
    )
    const week = await first<{ n: number; buyers: number }>(
      `SELECT COUNT(*) n, COUNT(DISTINCT visitor_id) buyers FROM chats WHERE shop_id = ? AND own = 0 AND questions > 0 AND updated_at >= ?`,
      shop.id,
      now() - 7 * 86_400_000,
    )
    return {
      on: !!row?.assistant,
      ready: aiReady(),
      off,
      plan: plan?.kind ?? 'free',
      use,
      week: { chats: week?.n ?? 0, buyers: week?.buyers ?? 0 },
      chats: chats.slice(0, PAGE),
      more: chats.length > PAGE,
      slug: shop.slug,
    }
  })

export type ChatLine = { role: 'buyer' | 'assistant'; text: string; at: number; cards: AskCard[]; action: AskAction | null; how: string | null; product: string | null }

/** One chat, read-only, for the seller. */
export const getChatThread = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => ({ id: isId(d?.id) ? String(d.id) : '' }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('manage')
    const chat = await first<ChatRow>(
      `SELECT c.id, c.questions, c.bag, c.whatsapp, c.own, c.lang, c.created_at, c.updated_at, p.name product, '' first
       FROM chats c LEFT JOIN products p ON p.id = c.product_id WHERE c.id = ? AND c.shop_id = ?`,
      data.id,
      shop.id,
    )
    if (!chat) return null
    const rows = await all<{ role: 'buyer' | 'assistant'; text: string; data: string | null; created_at: number }>(
      `SELECT role, text, data, created_at FROM chat_messages WHERE chat_id = ? ORDER BY id`,
      chat.id,
    )
    const names = new Map(
      (await all<{ id: string; name: string }>(`SELECT id, name FROM products WHERE shop_id = ?1 UNION ALL SELECT id, name FROM services WHERE shop_id = ?1`, shop.id)).map((x) => [x.id, x.name]),
    )
    const lines: ChatLine[] = rows.map((r) => {
      let d: { cards?: AskCard[]; action?: AskAction | null; how?: string; product?: string } = {}
      try {
        d = r.data ? JSON.parse(r.data) : {}
      } catch {
        /* an old row: text only */
      }
      return { role: r.role, text: r.text, at: r.created_at, cards: d.cards ?? [], action: d.action ?? null, how: d.how ?? null, product: d.product ?? null }
    })
    return { chat, lines, names: Object.fromEntries(names) as Record<string, string> }
  })

/** The seller's switch: buyers see Ask on the shop, or don't. */
export const setShopAssistant = createServerFn({ method: 'POST' })
  .validator((d: { on: boolean }) => ({ on: !!d?.on }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('manage')
    await run('UPDATE shops SET assistant = ? WHERE id = ?', data.on ? 1 : 0, shop.id)
    return { on: data.on }
  })

// ---------------------------------------------------------------------------------------------- /admin

/** Shopi's owner: the assistant off (or on again) for every shop at once, logged. */
export const setAssistantEverywhere = createServerFn({ method: 'POST' })
  .validator((d: { off: boolean }) => ({ off: !!d?.off }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin()
    await setAssistantOffEverywhere(data.off)
    await run('INSERT INTO admin_log (admin_id, action, shop_id, detail, created_at) VALUES (?, ?, NULL, ?, ?)', admin.id, 'assistant_everywhere', data.off ? 'off' : 'on', now())
    return { off: data.off }
  })
