import { Link, createFileRoute } from '@tanstack/react-router'
import { ExternalLink, MessageCircleQuestion } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, Empty, ErrorText, Nothing, Page, Sheet, Switch, TopBar } from '#/components/ui'
import { getAssistantPage, getChatThread, setShopAssistant, type ChatLine, type ChatRow } from '#/lib/api/assistant'
import { timeAgo } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'

/**
 * The seller's side of the AI assistant for buyers (roadmap `ai-buyer`; src/server/assistant.ts): the switch, this
 * month's questions, and every chat, read-only. Shop settings > AI assistant opens it (owner and Manager).
 */
export const Route = createFileRoute('/app/assistant')({
  loader: () => getAssistantPage({ data: {} }),
  head: () => ({ meta: [{ title: 'AI assistant · Shopi' }] }),
  component: AssistantPage,
})

function AssistantPage() {
  const t = useT()
  const d = Route.useLoaderData()
  const [on, setOn] = useState(d.on)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [chats, setChats] = useState<ChatRow[]>(d.chats)
  const [more, setMore] = useState(d.more)
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState<string | null>(null)

  async function toggle(next: boolean) {
    setSaving(true)
    setError('')
    setOn(next)
    try {
      await setShopAssistant({ data: { on: next } })
    } catch {
      setOn(!next)
      setError(t('Not saved. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  async function older() {
    setLoading(true)
    try {
      const next = await getAssistantPage({ data: { before: chats[chats.length - 1]?.updated_at } })
      setChats([...chats, ...next.chats])
      setMore(next.more)
    } finally {
      setLoading(false)
    }
  }

  const free = d.use.limit !== null
  const usedUp = free && d.use.left === 0

  return (
    <Page nav wide>
      <TopBar
        back="/app/shop"
        title={t('AI assistant')}
        sub={t('It answers buyers’ questions on your shop, from your shop’s details.')}
        right={
          <a href={`/${d.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <ExternalLink size={16} strokeWidth={1.75} /> {t('Try it on your shop')}
          </a>
        }
      />

      <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="space-y-3 md:space-y-4">
          <Card>
            {d.ready ? (
              <Switch
                label={t('Answer buyers’ questions')}
                sub={t('Buyers see Ask on your shop and on each product. It never opens by itself.')}
                checked={on}
                disabled={saving}
                onChange={toggle}
              />
            ) : (
              <Nothing>{t('The AI assistant isn’t available right now.')}</Nothing>
            )}
            {d.off && on && <p className="mt-3 rounded-14 bg-page px-4 py-3 text-14 text-ink-2">{t('Shopi has paused the AI assistant for every shop for now. Your switch is kept.')}</p>}
            {error && (
              <div className="mt-3">
                <ErrorText>{error}</ErrorText>
              </div>
            )}
            <div className="mt-5 border-t border-line pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-14 text-muted">{t('Questions this month')}</p>
                <p className="tnum text-15 font-medium">{free ? t('{n} of {max}', { n: d.use.used, max: d.use.limit! }) : d.use.used}</p>
              </div>
              {free && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-well" aria-hidden>
                  <div className={`h-full rounded-full ${usedUp ? 'bg-moto' : 'bg-ink'}`} style={{ width: `${Math.min(100, (d.use.used / d.use.limit!) * 100)}%` }} />
                </div>
              )}
              <p className="mt-2 text-13 leading-5 text-muted">
                {usedUp
                  ? t('Your assistant answered its {max} questions this month. Ask comes back on the 1st, or with no limit on Tembo.', { max: d.use.limit! })
                  : free
                    ? t('Free shops get {max} a month. Tapped questions and order codes don’t count.', { max: d.use.limit! })
                    : t('No limit with Tembo.')}
              </p>
              {free && (
                <Link to="/app/plan" className="mt-3 inline-flex min-h-11 items-center text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  {t('See what Tembo adds')}
                </Link>
              )}
            </div>
          </Card>

          <Card title={t('What it does')}>
            <ul className="list-disc space-y-2 pl-5 text-14 leading-relaxed text-ink-2 marker:text-faint">
              <li>{t('Answers from your products, prices, sizes and stock, your delivery areas, how buyers pay, and your hours and location.')}</li>
              <li>{t('Never changes a price, gives a discount or promises what your shop doesn’t say. When it doesn’t know, it sends the buyer to your WhatsApp with the question written in.')}</li>
              <li>{t('Offers to put a product in the bag; the buyer taps to agree. Orders reach you as usual.')}</li>
              <li>{t('Tells a buyer their order’s status when they type its code.')}</li>
            </ul>
            <p className="mt-4 text-13 leading-5 text-muted">{t('The more your descriptions say (fabric, sizes, what is included), the more it can answer.')}</p>
          </Card>
        </div>

        <Card title={t('Questions from buyers')} sub={t(d.week.chats === 1 ? '{n} chat in the last 7 days' : '{n} chats in the last 7 days', { n: d.week.chats })}>
          {chats.length === 0 ? (
            <Empty
              icon={<MessageCircleQuestion size={20} strokeWidth={1.75} />}
              title={t('No questions yet')}
              body={t('Buyers see Ask on your shop and on each product. Each chat shows here.')}
            />
          ) : (
            <>
              <ul className="-mx-2 divide-y divide-line">
                {chats.map((c) => (
                  <li key={c.id}>
                    <ChatListRow c={c} onOpen={() => setReading(c.id)} />
                  </li>
                ))}
              </ul>
              {more && (
                <button type="button" className="btn btn-ghost btn-sm mt-4" disabled={loading} onClick={older}>
                  {t('Show older chats')}
                </button>
              )}
            </>
          )}
        </Card>
      </div>

      {reading && <Thread id={reading} onClose={() => setReading(null)} />}
    </Page>
  )
}

function ChatListRow({ c, onOpen }: { c: ChatRow; onOpen: () => void }) {
  const t = useT()
  const lang = useLang()
  const tags = [c.own ? t('You') : '', c.bag ? t('Put in bag') : '', c.whatsapp ? 'WhatsApp' : ''].filter(Boolean)
  return (
    <button type="button" className="flex w-full flex-col gap-1 rounded-14 px-2 py-3 text-left transition-colors hover:bg-page" onClick={onOpen}>
      <span className="flex w-full items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-15">{c.first || t('A question')}</span>
        <span className="meta shrink-0">{timeAgo(c.updated_at, lang)}</span>
      </span>
      <span className="flex w-full min-w-0 items-center gap-2 text-13 text-muted">
        {tags.map((x) => (
          <span key={x} className="inline-flex h-6 shrink-0 items-center rounded-full bg-well px-2.5 text-12 font-medium text-ink-2">
            {x}
          </span>
        ))}
        <span className="min-w-0 truncate">{[t(c.questions === 1 ? '{n} question' : '{n} questions', { n: c.questions }), c.product ?? ''].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
}

/** One chat as the buyer saw it, read-only. */
function Thread({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const [data, setData] = useState<Awaited<ReturnType<typeof getChatThread>> | undefined>(undefined)
  useEffect(() => {
    let live = true
    getChatThread({ data: { id } })
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
  }, [id])
  return (
    <Sheet open onClose={onClose} title={t('Chat')} head={data?.chat ? <p className="text-13 text-muted">{[timeAgo(data.chat.created_at, lang), data.chat.product ?? ''].filter(Boolean).join(' · ')}</p> : undefined}>
      <div className="pb-2">
        {data === undefined ? (
          <p className="text-14 text-muted">{t('Loading')}</p>
        ) : data === null ? (
          <Nothing>{t('This chat is no longer here.')}</Nothing>
        ) : (
          <div className="space-y-3">
            {data.lines.map((l, i) => (
              <Line key={i} l={l} names={data.names} />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function Line({ l, names }: { l: ChatLine; names: Record<string, string> }) {
  const t = useT()
  const shown = l.cards.map((c) => names[c.id]).filter(Boolean)
  const offered =
    l.action?.type === 'bag'
      ? t('Offered to put {product} in the bag', { product: [names[l.action.product] ?? t('a product'), l.action.option].filter(Boolean).join(', ') })
      : l.action?.type === 'whatsapp'
        ? t('Offered WhatsApp')
        : l.action?.type === 'order'
          ? t('Showed order {code}', { code: l.action.code })
          : ''
  return (
    <div className={`flex ${l.role === 'buyer' ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        <div className={`rounded-20 px-4 py-2.5 text-15 leading-relaxed break-words ${l.role === 'buyer' ? 'bg-ink text-white' : 'bg-page text-ink'}`}>{l.text}</div>
        {(shown.length > 0 || offered) && (
          <p className="mt-1 px-1 text-13 text-muted">{[shown.length ? t('Showed: {products}', { products: shown.join(', ') }) : '', offered].filter(Boolean).join(' · ')}</p>
        )}
      </div>
    </div>
  )
}
