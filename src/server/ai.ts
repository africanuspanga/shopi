import { env } from 'cloudflare:workers'
import { all, first, now, run } from '#/server/db'
import { DAY, FREE_AI_MONTH, TEMBO_AI_DAY, type PlanState } from '#/lib/plans'

/**
 * AI for sellers, through any OpenAI-compatible chat API (roadmap Stage 3, starting with `ai-desc`, 18 Nov 2026).
 * Live: Groq (the founder's choice, 19 Nov), with `AI_BASE_URL` and `AI_MODEL` in `wrangler.jsonc` and the key as the
 * secret `AI_API_KEY`. Locally: a Groq test key in `.dev.vars`. Without a key, `aiReady()` is false and the buttons stay
 * hidden.
 *
 * Allowance (the founder, 18 Nov): Free shops get FREE_AI_MONTH descriptions a calendar month in Dar; Tembo and demo
 * shops are unlimited, with a quiet TEMBO_AI_DAY a day. `ai_uses` counts uses (no text is kept).
 */

const base = () => (env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '')
const key = () => env.AI_API_KEY ?? env.OPENAI_API_KEY ?? ''
const groq = () => base().includes('groq.com')
// On Groq Qwen kept to the seller's facts and added no hype; gpt-oss-120b invented "elegant", "kifahari", "timeless
// look" and "easy to carry" whatever the rules said (side by side, 18 and 19 Nov).
const model = () => env.AI_MODEL ?? (groq() ? 'qwen/qwen3.8-27b' : 'gpt-6-luna')

export const aiReady = () => !!key()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * One answer from the model, as plain text. Throws on errors and after about 30 seconds.
 * Two quiet second tries: when the provider asks to wait a few seconds (Groq's per-minute token limit, 429 with
 * `retry-after`), and when the answer comes back empty (Qwen sometimes ends before its first word, 19 Nov).
 */
export async function complete(system: string, user: string, opts: { maxTokens?: number; examples?: [string, string][] } = {}) {
  const started = Date.now()
  let waited = false
  let retried = false
  for (;;) {
    const res = await fetch(`${base()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
      body: JSON.stringify({
        model: model(),
        // Examples as earlier turns: the model copies a shown style far better than it follows "don't" rules.
        messages: [
          { role: 'system', content: system },
          ...(opts.examples ?? []).flatMap(([q, a]) => [
            { role: 'user', content: q },
            { role: 'assistant', content: a },
          ]),
          { role: 'user', content: user },
        ],
        // Low: at 0.4 Qwen now and then misspelt a Swahili word ("ngao" for "nguo", 19 Nov).
        temperature: retried ? 0.5 : 0.2,
        max_completion_tokens: opts.maxTokens ?? 900,
        // Thinking models: gpt-oss at "medium" (at "low" it ignored the word rules); Qwen on Groq thinks unseen
        // (with thinking off it invented more: "white leather" for sneakers, 19 Nov).
        ...(model().includes('gpt-oss') ? { reasoning_effort: 'medium' } : {}),
        ...(groq() && model().includes('qwen') ? { reasoning_format: 'hidden' } : {}),
      }),
      signal: AbortSignal.timeout(Math.max(5_000, 30_000 - (Date.now() - started))),
    })
    if (res.status === 429 && !waited) {
      const wait = Math.ceil(Number(res.headers.get('retry-after')) || 3)
      if (wait <= 10) {
        waited = true
        await res.body?.cancel()
        await sleep(wait * 1000 + 250)
        continue
      }
    }
    if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text && !retried && Date.now() - started < 15_000) {
      retried = true
      continue
    }
    return { text, tokens: data.usage?.total_tokens ?? null }
  }
}

/** The start of this calendar month in Dar (UTC+3), in ms. */
function monthStart(t = now()) {
  const d = new Date(t + 3 * 3600_000)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 3 * 3600_000
}

export type Allowance = { ready: boolean; limit: number | null; left: number | null; busy: boolean }

/** What a shop may still ask for: Free counts the month; Tembo and demo have no limit but the quiet daily one. */
export async function aiAllowance(shopId: string, plan: PlanState | null): Promise<Allowance> {
  const ready = aiReady()
  if (plan?.kind === 'free' || !plan) {
    const row = await first<{ n: number }>(`SELECT COUNT(*) n FROM ai_uses WHERE shop_id = ? AND kind = 'description' AND created_at >= ?`, shopId, monthStart())
    const left = Math.max(0, FREE_AI_MONTH - (row?.n ?? 0))
    return { ready, limit: FREE_AI_MONTH, left, busy: false }
  }
  const row = await first<{ n: number }>(`SELECT COUNT(*) n FROM ai_uses WHERE shop_id = ? AND created_at >= ?`, shopId, now() - DAY)
  return { ready, limit: null, left: null, busy: (row?.n ?? 0) >= TEMBO_AI_DAY }
}

export async function recordUse(shopId: string, kind: string, tokens: number | null) {
  await run('INSERT INTO ai_uses (shop_id, kind, tokens, created_at) VALUES (?, ?, ?, ?)', shopId, kind, tokens, now())
}

/** For the nightly job: uses older than about 13 months. */
export async function purgeAiUses() {
  const res = await run('DELETE FROM ai_uses WHERE created_at < ?', now() - 400 * DAY)
  return { deleted: res.meta.changes }
}

export type DescriptionInput = {
  name: string
  notes: string
  option: string
  options: string[]
  shop: { name: string; category: string; location: string; lang: 'sw' | 'en' }
}

const SYSTEM = {
  en: 'English',
  sw: 'Swahili (everyday Tanzanian Swahili, the way sellers write on Instagram and WhatsApp; English words they use, like size, delivery and original, are fine)',
}

/** One worked example per language: the tone Shopi wants (facts given, nothing added, no hype). */
const EXAMPLES: Record<'sw' | 'en', [string, string][]> = {
  // Deliberately not clothing: a dress must never borrow an example's length or fabric (it did, 18 Nov).
  en: [
    [
      "Product: Shea butter body cream\nShop: Asili Naturals, which sells beauty and care, in Mikocheni, Dar es Salaam\nBuyers choose a size: 250 g, 500 g\nThe seller's notes (use them, they are facts): pure shea butter and coconut oil, no scent, for dry skin",
      'A body cream of pure shea butter and coconut oil, made for dry skin. It has no scent, so it sits well under perfume.\n\n- Jars of 250 g or 500 g',
    ],
    // With no notes: one plain sentence from the name and the options, nothing guessed (19 Nov: without this example
    // the model gave sneakers "white leather" and a wedding gown "for a woman").
    ['Product: Wall clock\nShop: Nyumba Bora, which sells home and living\nBuyers choose a colour: Black, Silver\nThe seller gave no notes.', 'A wall clock, in black or silver.'],
  ],
  sw: [
    [
      "Product: Krimu ya mwili ya shea\nShop: Asili Naturals, which sells beauty and care, in Mikocheni, Dar es Salaam\nBuyers choose a size: 250 g, 500 g\nThe seller's notes (use them, they are facts): shea butter halisi na mafuta ya nazi, haina harufu, kwa ngozi kavu",
      'Krimu ya mwili ya shea butter halisi na mafuta ya nazi, kwa ngozi kavu. Haina harufu, kwa hiyo unaweza kupaka perfume juu yake.\n\n- Chupa za 250 g au 500 g',
    ],
    ['Product: Saa ya ukutani\nShop: Nyumba Bora, which sells home and living\nBuyers choose a colour: Nyeusi, Silver\nThe seller gave no notes.', 'Saa ya ukutani, rangi nyeusi au silver.'],
  ],
}

/** The hype the rules forbid, caught once more after the model (a safety net, not the main guard). */
const HYPE = /\b(?:perfect|lovely|stunning|gorgeous|vibrant|amazing|must-have|elevate[sd]?)\s+/gi

/**
 * A product description in the shop's language. The rules keep it honest: only what the seller said, nothing invented,
 * and Shopi's tone (plain, specific, no exclamation marks, emoji or hype words).
 */
export async function writeDescription(d: DescriptionInput) {
  const system = [
    'You write product descriptions for small online shops in Tanzania that sell on Instagram, TikTok and WhatsApp.',
    `Write in ${SYSTEM[d.shop.lang]}.`,
    'Rules:',
    '- One to four short sentences that help a buyer decide: what it is and what the seller said about it. With few facts, write one short sentence: a short honest description is better than a long one with guesses.',
    '- Then, only if the seller gave such facts, up to four short lines starting with "- " (material, fit, sizes or colours, care).',
    '- Use only what the seller told you and what the product name says. Never invent materials, colours, sizes, brands, origins, guarantees, stock or delivery promises, and never add qualities nobody gave (comfortable, breezy, flattering, soft, durable, warm weather, classic, easy to carry).',
    '- Never say who it is for (men, women, children, brides) or when or where to wear or use it (occasions, seasons, events), unless the seller said so.',
    '- Plain and warm, like a good seller talking to a buyer. No exclamation marks, no emoji, no hashtags.',
    '- Never use these words or their Swahili equivalents: amazing, perfect, best, stunning, gorgeous, vibrant, luxury, must-have, elevate, ideal, elegant (kifahari).',
    ...(d.shop.lang === 'sw' ? ['- Write correct, simple Swahili with common words. Never translate an English phrase word for word; when unsure of a phrase, leave it out.'] : []),
    '- In the lines that start with "- ", do not repeat what the sentences already said.',
    '- Do not start with the product name and do not mention the price: the shop shows both.',
    '- Output only the description text, with no title, quotes or markdown.',
    '- An earlier exchange may show another product: it shows the tone only. Its details belong to that product; never carry them over.',
  ].join('\n')
  const user = [
    `Product: ${d.name}`,
    `Shop: ${d.shop.name}, which sells ${d.shop.category}${d.shop.location ? `, in ${d.shop.location}` : ''}`,
    d.options.length ? `Buyers choose a ${d.option}: ${d.options.join(', ')}` : '',
    d.notes ? `The seller's notes (use them, they are facts): ${d.notes}` : 'The seller gave no notes.',
  ]
    .filter(Boolean)
    .join('\n')
  const out = await complete(system, user, { examples: EXAMPLES[d.shop.lang] })
  const text = cleanText(out.text)
  return { text: d.shop.lang === 'sw' ? sellerSpelling(text, [d.name, d.notes, ...d.options, d.shop.name, d.shop.location]) : text, tokens: out.tokens }
}

/**
 * Puts the seller's own spelling back where the model changed one letter inside a word the seller typed: Qwen wrote
 * "ngao" (shield) for the seller's "nguo" (clothes) in about 1 of 4 tries, on 18 and 19 Nov, at any temperature. Only a
 * same-length word with the same first two letters and the same last letter, one letter apart, and only when one of
 * the seller's words fits: Swahili's class and plural changes sit at the start (kitenge, vitenge) and its verb moods
 * at the end (nunua, nunue), so those stay as the model wrote them.
 */
export function sellerSpelling(text: string, facts: string[]) {
  const words = new Set(facts.join(' ').toLowerCase().match(/\p{L}{4,}/gu) ?? [])
  return text.replace(/\p{L}{4,}/gu, (w) => {
    const lw = w.toLowerCase()
    if (words.has(lw)) return w
    const fits = [...words].filter((f) => {
      if (f.length !== lw.length || f.slice(0, 2) !== lw.slice(0, 2) || f.at(-1) !== lw.at(-1)) return false
      let diff = 0
      for (let i = 2; i < f.length - 1; i++) if (f[i] !== lw[i]) diff++
      return diff === 1
    })
    if (fits.length !== 1) return w
    return w[0] === w[0].toUpperCase() ? fits[0][0].toUpperCase() + fits[0].slice(1) : fits[0]
  })
}

/** Markdown, quotes and stray symbols out; at most 1,200 characters. */
function cleanText(s: string) {
  return s
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/^[•*]\s+/gm, '- ')
    .replace(/!/g, '.')
    .replace(/\bperfect for\b/gi, (m) => (m[0] === 'P' ? 'For' : 'for'))
    .replace(HYPE, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\.\.+/g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1200)
}

/** Shop bios a shop may have written in a calendar month, on any plan: a bio is written once or twice, not daily. */
export const BIO_MONTH = 10

/** Whether a shop may have another bio written this month. */
export async function bioLeft(shopId: string) {
  const row = await first<{ n: number }>(`SELECT COUNT(*) n FROM ai_uses WHERE shop_id = ? AND kind = 'bio' AND created_at >= ?`, shopId, monthStart())
  return Math.max(0, BIO_MONTH - (row?.n ?? 0))
}

export type BioInput = { name: string; category: string; location: string; products: string[]; notes: string; lang: 'sw' | 'en' }

// One worked example per language as an earlier turn. The short one for a shop with almost no facts (on 18 Nov, given
// only "clothes and fashion", the model added "for men and women") sits in the rules instead: as a second turn it made
// Qwen end before its first word, 5 times in 5 (19 Nov).
const BIO_EXAMPLES: Record<'sw' | 'en', [string, string][]> = {
  en: [
    [
      'Shop: Asili Naturals\nSells: beauty and care\nWhere: Mikocheni, Dar es Salaam\nSome products: Shea butter body cream, Coconut oil soap',
      'Body creams and soaps made with shea butter and coconut oil, from Mikocheni, Dar es Salaam.',
    ],
  ],
  sw: [
    [
      'Shop: Asili Naturals\nSells: beauty and care\nWhere: Mikocheni, Dar es Salaam\nSome products: Krimu ya mwili ya shea, Sabuni ya mafuta ya nazi',
      'Krimu za mwili na sabuni za shea butter na mafuta ya nazi, kutoka Mikocheni, Dar es Salaam.',
    ],
  ],
}
const BIO_SHORT = {
  en: '"Shoes. Choose yours here and order in a few taps."',
  sw: '"Viatu. Chagua unavyopenda hapa na uagize moja kwa moja."',
}

/**
 * The line under a shop's name (setup step 4 and Shop settings): what it sells and where, from the shop's own facts.
 * One sentence, two at most; nothing about delivery, prices or quality that the seller didn't say.
 */
export async function writeBio(d: BioInput) {
  const system = [
    'You write the one-line description under the name of a small online shop in Tanzania that sells on Instagram, TikTok and WhatsApp.',
    `Write in ${SYSTEM[d.lang]}.`,
    'Rules:',
    '- One sentence, two at most, under 160 characters: what the shop sells and, if given, where it is.',
    '- Use only the facts given: the shop name, what it sells, where, its products and the seller\'s notes. Never invent delivery promises, prices, opening hours, quality claims, years in business, guarantees, a style, tradition or origin (traditional, modern, asili, kisasa), or what the products suit (everyday, style, occasions).',
    '- Name the products the way the facts write them; with one or two products, name them and stop.',
    `- Never say who the products are for (men, women, children, brides) or how many kinds or styles there are, unless the facts say it. With few facts, write a short line: for a shop that only says it sells shoes, ${BIO_SHORT[d.lang]}`,
    '- Plain and warm. No exclamation marks, no emoji, no hashtags, no hype words (amazing, best, quality, perfect, luxury, affordable).',
    ...(d.lang === 'sw' ? ['- Write correct, simple Swahili with common words. Never translate an English phrase word for word.'] : []),
    '- Do not start with the shop name: the page shows it right above.',
    '- Output only the line, with no quotes or markdown.',
    '- An earlier exchange shows another shop: it shows the tone only; never carry its details over.',
  ].join('\n')
  const user = [
    `Shop: ${d.name}`,
    d.category ? `Sells: ${d.category}` : '',
    d.location ? `Where: ${d.location}` : '',
    d.products.length ? `Some products: ${d.products.join(', ')}` : '',
    d.notes ? `The seller's notes (facts): ${d.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  // Room for Qwen's unseen thinking: it counts against the cap (gpt-oss cut a line mid-word at 400, 19 Nov).
  const out = await complete(system, user, { examples: BIO_EXAMPLES[d.lang], maxTokens: 900 })
  const text = cleanText(out.text).replace(/\s*\n+\s*/g, ' ').slice(0, 300)
  return { text: d.lang === 'sw' ? sellerSpelling(text, [d.name, d.category, d.location, ...d.products, d.notes]) : text, tokens: out.tokens }
}

/** Uses per shop for /admin: descriptions written in the last `days`. */
export function aiUseCounts(from: number) {
  return all<{ shop_id: string; n: number }>(`SELECT shop_id, COUNT(*) n FROM ai_uses WHERE created_at >= ? GROUP BY shop_id`, from)
}
