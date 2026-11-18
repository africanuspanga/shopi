import { env } from 'cloudflare:workers'
import { all, first, now, run } from '#/server/db'
import { DAY, FREE_AI_MONTH, TEMBO_AI_DAY, type PlanState } from '#/lib/plans'

/**
 * AI for sellers, through any OpenAI-compatible chat API (roadmap Stage 3, starting with `ai-desc`, 18 Nov 2026).
 * Live: OpenAI with the founder's key (a Worker secret). Locally: a Groq test key in `.dev.vars` (AI_BASE_URL points at
 * Groq), never in production. Without a key, `aiReady()` is false and the buttons stay hidden.
 *
 * Allowance (the founder, 18 Nov): Free shops get FREE_AI_MONTH descriptions a calendar month in Dar; Tembo and demo
 * shops are unlimited, with a quiet TEMBO_AI_DAY a day. `ai_uses` counts uses (no text is kept).
 */

const base = () => (env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
const key = () => env.AI_API_KEY ?? env.OPENAI_API_KEY ?? ''
const groq = () => base().includes('groq.com')
// On Groq (local tests) Qwen kept to the seller's facts and added no hype; gpt-oss invented "elegant" and "kifahari"
// (side by side, 18 Nov). Live uses OpenAI; compare again there before switching AI on for sellers.
const model = () => env.AI_MODEL ?? (groq() ? 'qwen/qwen3.8-27b' : 'gpt-6-luna')

export const aiReady = () => !!key()

/** One answer from the model, as plain text. Throws on errors and after 30 seconds. */
export async function complete(system: string, user: string, opts: { maxTokens?: number; examples?: [string, string][] } = {}) {
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
      temperature: 0.4,
      max_completion_tokens: opts.maxTokens ?? 900,
      // Thinking models: gpt-oss at "medium" (at "low" it ignored the word rules); Qwen on Groq thinks unseen.
      ...(model().includes('gpt-oss') ? { reasoning_effort: 'medium' } : {}),
      ...(groq() && model().includes('qwen') ? { reasoning_format: 'hidden' } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
  return { text: data.choices?.[0]?.message?.content?.trim() ?? '', tokens: data.usage?.total_tokens ?? null }
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
  ],
  sw: [
    [
      "Product: Krimu ya mwili ya shea\nShop: Asili Naturals, which sells beauty and care, in Mikocheni, Dar es Salaam\nBuyers choose a size: 250 g, 500 g\nThe seller's notes (use them, they are facts): shea butter halisi na mafuta ya nazi, haina harufu, kwa ngozi kavu",
      'Krimu ya mwili ya shea butter halisi na mafuta ya nazi, kwa ngozi kavu. Haina harufu, kwa hiyo unaweza kupaka perfume juu yake.\n\n- Chupa za 250 g au 500 g',
    ],
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
    '- Two to four short sentences that help a buyer decide: what it is, what it is like, when to wear or use it.',
    '- Then, only if the seller gave such facts, up to four short lines starting with "- " (material, fit, sizes or colours, care).',
    '- Use only what the seller told you and what the product name says. Never invent materials, sizes, brands, origins, guarantees, stock or delivery promises, and never add qualities nobody gave (comfortable, breezy, flattering, soft, durable, warm weather). Leave out what you do not know.',
    '- Plain and warm, like a good seller talking to a buyer. No exclamation marks, no emoji, no hashtags.',
    '- Never use these words or their Swahili equivalents: amazing, perfect, best, stunning, gorgeous, vibrant, luxury, must-have, elevate, ideal. Say what it is good for plainly ("for weddings", "kwa harusi").',
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
  return { text: cleanText(out.text), tokens: out.tokens }
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

/** Uses per shop for /admin: descriptions written in the last `days`. */
export function aiUseCounts(from: number) {
  return all<{ shop_id: string; n: number }>(`SELECT shop_id, COUNT(*) n FROM ai_uses WHERE created_at >= ? GROUP BY shop_id`, from)
}
