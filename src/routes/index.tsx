import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Banknote, ChartColumn, Check, ChevronDown, CircleCheck, CircleHelp, Footprints, ImageDown, Link2, MapPin, Plus, Ruler, ShieldCheck, Smartphone, Tag, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { WhatsAppIcon } from '#/components/brand-icons'
import { FloatingNav, NavCenter, NavTab } from '#/components/floating-nav'
import { BioPreview, LinkPreview, MiniStore, NewOrderCard, OrderPreview, PaymentSlip, Phone, ProductPreview, SmsBubble } from '#/components/showcase'
import { Wordmark } from '#/components/ui'
import { useT } from '#/lib/i18n'
import { PLANS } from '#/lib/plans'
import { SITE, canonical, ld } from '#/lib/seo'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Shopi · Your shop in one link · Duka lako, link moja' },
      { property: 'og:title', content: 'Shopi · Your shop in one link' },
      { property: 'og:url', content: SITE },
      ld({
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'Shopi',
        legalName: 'Driftmark Technologies Limited',
        url: SITE,
        logo: `${SITE}/icon-512.png`,
        email: 'hello@shopi.tz',
        address: { '@type': 'PostalAddress', addressLocality: 'Dar es Salaam', addressCountry: 'TZ' },
      }),
      ld({ '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'Shopi', url: SITE, publisher: { '@id': `${SITE}/#organization` } }),
    ],
    links: [canonical('/')],
  }),
  component: Landing,
})

function Landing() {
  const t = useT()
  const { session } = Route.useRouteContext()
  const start = session.user ? (session.shop ? '/app' : '/onboard') : '/signup'
  const startLabel = session.shop ? t('Go to my shop') : t('Start 14 days free')

  return (
    <div className="min-h-dvh overflow-x-clip bg-page pb-24 text-ink md:pb-0">
      <Nav start={start} signedIn={!!session.user} hasShop={!!session.shop} />
      <Hero start={start} startLabel={startLabel} />
      <Steps />
      <Payments />
      <Orders />
      <Dashboard />
      <Features />
      <Pricing start={start} />
      <Faq />
      <Finale start={start} startLabel={startLabel} signedIn={!!session.user} />
      <SectionTabs start={start} startLabel={startLabel} />
    </div>
  )
}

function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1280px] px-4 md:px-10 ${className}`}>{children}</div>
}

function H2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`display text-[36px] md:text-[52px] lg:text-[60px] ${className}`}>{children}</h2>
}

function Lead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`max-w-[34rem] text-[17px] leading-relaxed text-ink-2 md:text-[18px] ${className}`}>{children}</p>
}

/* ---------- Nav: a floating capsule at the top; on phones the sections live in the bottom capsule ---------- */

function Nav({ start, signedIn, hasShop }: { start: string; signedIn: boolean; hasShop: boolean }) {
  const t = useT()
  const links = [
    ['#how', t('How it works')],
    ['#pay', t('Payments')],
    ['#pricing', t('Pricing')],
    ['#faq', t('Questions')],
  ]
  return (
    <div className="pointer-events-none sticky top-0 z-50 px-3 pt-3 md:px-6 md:pt-4">
      <header className="pointer-events-auto mx-auto flex h-14 max-w-[1180px] items-center gap-2 rounded-full bg-card/92 pr-2 pl-5 shadow-[0_1px_2px_rgb(10_10_10/0.05),0_12px_32px_-14px_rgb(10_10_10/0.22)] ring-1 ring-line backdrop-blur-xl md:h-16 md:pl-7">
        <Link to="/" aria-label="Shopi" className="shrink-0">
          <Wordmark className="h-[22px] w-auto md:h-[24px]" />
        </Link>
        <nav className="mx-auto hidden items-center gap-1 text-[14px] text-ink-2 md:flex" aria-label={t('Sections')}>
          {links.map(([href, label]) => (
            <a key={href} href={href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-page hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {signedIn ? (
            <Link to={start} className="rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink md:hidden">
              {hasShop ? t('My shop') : t('Finish my shop')}
            </Link>
          ) : (
            <Link to="/login" className="rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink">
              {t('Log in')}
            </Link>
          )}
          <Link to={start} className="btn btn-sm hidden h-10 px-4 md:inline-flex">
            {hasShop ? t('My shop') : t('Open your shop')}
          </Link>
        </div>
      </header>
    </div>
  )
}

/** Phones: the floating black capsule. The section on screen lights up; + opens a shop. */
function SectionTabs({ start, startLabel }: { start: string; startLabel: string }) {
  const t = useT()
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const ids = ['top', 'how', 'pay', 'pricing', 'faq']
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    // A thin band across the middle of the screen: the section crossing it is the one being read.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id === 'top' ? null : e.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return (
    <FloatingNav label={t('Sections')}>
      <NavTab icon={Footprints} label={t('Steps')} href="#how" active={active === 'how'} />
      <NavTab icon={Wallet} label={t('Payments')} href="#pay" active={active === 'pay'} />
      <NavCenter icon={Plus} label={startLabel} to={start} />
      <NavTab icon={Tag} label={t('Pricing')} href="#pricing" active={active === 'pricing'} />
      <NavTab icon={CircleHelp} label={t('Questions')} href="#faq" active={active === 'faq'} />
    </FloatingNav>
  )
}

/* ---------- Hero ---------- */

function Hero({ start, startLabel }: { start: string; startLabel: string }) {
  const t = useT()
  return (
    <section id="top" className="relative">
      <Container className="grid items-center gap-12 pt-10 pb-16 md:pt-16 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:gap-16 lg:pt-6 lg:pb-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div className="rise">
          <h1 className="display text-[44px] text-balance sm:text-[60px] lg:text-[74px] xl:text-[84px]">
            {t('Stop answering')} <span className="whitespace-nowrap">“bei gani?”</span> {t('in your DMs')}
          </h1>
          <Lead className="mt-6 md:mt-8">
            {t('Shopi turns your Instagram, TikTok and WhatsApp into a shop with one link. Buyers see your prices and sizes, order by themselves, and pay your Lipa Namba or cash on delivery.')}
          </Lead>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center md:mt-10">
            <Link to={start} className="btn btn-lg">
              {startLabel} <ArrowRight size={18} strokeWidth={1.75} />
            </Link>
            <a href="#how" className="btn btn-lg btn-ghost bg-transparent">
              {t('See how it works')}
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-2">
            {[t('14 days free'), t('No commission on sales'), t('Ready in 5 minutes')].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <Check size={15} strokeWidth={2} className="text-ink" /> {x}
              </li>
            ))}
          </ul>
        </div>
        <HeroVisual />
      </Container>
    </section>
  )
}

function HeroVisual() {
  return (
    <div className="rise-2 relative mx-auto h-[600px] w-full max-w-[360px] sm:h-[680px] sm:max-w-[560px]">
      <Phone className="absolute top-0 left-1/2 h-[600px] w-[300px] -translate-x-1/2 sm:h-[660px] sm:w-[328px]">
        <MiniStore />
      </Phone>
      <NewOrderCard className="absolute top-[300px] -left-2 hidden sm:block lg:-left-12" />
      <PaymentSlip className="absolute -right-2 bottom-[120px] hidden sm:block lg:-right-10" />
    </div>
  )
}

/* ---------- How it works ---------- */

function Steps() {
  const t = useT()
  const steps = [
    { title: t('Open your shop'), body: t('Pick a name and a link. Add your WhatsApp, your Lipa Namba and the areas you deliver to.'), visual: <LinkPreview /> },
    { title: t('Add your products'), body: t('Snap a photo, set the price, sizes and stock. Photos shrink on upload, so buyers spend less data.'), visual: <ProductPreview /> },
    { title: t('Share your link'), body: t('Put it in your Instagram and TikTok bio and your WhatsApp status. Orders reach you complete.'), visual: <BioPreview /> },
  ]
  return (
    <section id="how" className="scroll-mt-24 py-20 md:py-32">
      <Container>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-end">
          <H2>{t('Three steps to your first order')}</H2>
          <Lead>{t('No website, no developer, no laptop. You set it up on your phone, the same day.')}</Lead>
        </div>
        <ol className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3 md:gap-5">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-[28px] bg-card p-3">
              <div className="flex h-[220px] items-center justify-center rounded-[20px] bg-page px-5">{s.visual}</div>
              <div className="px-4 pt-6 pb-5">
                <p className="meta">{t('Step {n}', { n: i + 1 })}</p>
                <h3 className="title mt-2 text-[22px]">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}

/* ---------- Payments ---------- */

function Payments() {
  const t = useT()
  return (
    <section id="pay" className="scroll-mt-24 px-2 md:px-4">
      <div className="mx-auto max-w-[1400px] rounded-[32px] bg-ink py-16 text-white md:rounded-[40px] md:py-28">
        <Container className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
          <div>
            <H2>{t('Every shilling goes straight to you')}</H2>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-white/70 md:text-[18px]">
              {t('Buyers pay your own Lipa Namba, the way they already pay sellers. Then they paste the confirmation SMS. Shopi checks the amount, the name and the transaction ID, and refuses an SMS already used on another order. You confirm with one tap.')}
            </p>
            <ul className="mt-10 divide-y divide-white/10 border-y border-white/10">
              {[
                [Smartphone, t('Your own Lipa Namba, on any network')],
                [Banknote, t('Cash on delivery when you want it')],
                [ShieldCheck, t('Shopi never holds your money')],
              ].map(([Icon, label]) => {
                const I = Icon as typeof Smartphone
                return (
                  <li key={label as string} className="flex items-center gap-4 py-4 text-[16px]">
                    <I size={20} strokeWidth={1.5} className="shrink-0 text-white/60" /> {label as string}
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-[440px]">
            <p className="text-[13px] text-white/50">{t('The buyer’s SMS, pasted on their order page')}</p>
            <div className="mt-3">
              <SmsBubble />
            </div>
            <div className="mt-6 rounded-[24px] bg-card p-6 text-ink">
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-semibold">{t('Shopi checked it')}</p>
                <p className="code text-[12px] text-muted">#HAN8RG</p>
              </div>
              <ul className="mt-4 space-y-3 text-[14px]">
                {[t('Amount matches the order'), t('Paid to your shop’s name'), t('Transaction never used before')].map((x) => (
                  <li key={x} className="flex items-center gap-3">
                    <CircleCheck size={18} strokeWidth={1.75} className="shrink-0 text-ok" /> {x}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white">{t('Payment received')}</div>
            </div>
          </div>
        </Container>
      </div>
    </section>
  )
}

/* ---------- Orders ---------- */

function Orders() {
  const t = useT()
  return (
    <section className="py-20 md:py-32">
      <Container className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
        <div className="order-2 flex justify-center rounded-[32px] bg-well px-4 py-10 md:py-14 lg:order-1">
          <OrderPreview />
        </div>
        <div className="order-1 lg:order-2">
          <H2>{t('Orders arrive complete. No ten questions')}</H2>
          <Lead className="mt-6">
            {t('Every order comes with the buyer’s name, number, area, a landmark the rider can find, and the size they picked. The buyer gets a page to follow it, and your stock goes down by itself.')}
          </Lead>
          <ul className="mt-8 space-y-3 text-[15px]">
            {[t('One tap to call or WhatsApp the buyer'), t('Statuses the buyer can see: confirmed, on the way, delivered'), t('Sold out shows by itself when stock runs out')].map((x) => (
              <li key={x} className="flex items-start gap-3">
                <Check size={18} strokeWidth={2} className="mt-0.5 shrink-0" /> {x}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  )
}

/* ---------- Dashboard ---------- */

function Dashboard() {
  const t = useT()
  return (
    <section className="pb-20 md:pb-32">
      <Container>
        <div className="mx-auto max-w-[760px] text-center">
          <H2>{t('Your business, in numbers')}</H2>
          <Lead className="mx-auto mt-6">{t('Sales today and this week, orders that need you, visits, shares and your best sellers. On your phone or on a laptop.')}</Lead>
        </div>
        <div className="relative mx-auto mt-12 max-w-[1120px] md:mt-16">
          <img
            src="/images/shopi-seller-dashboard-desktop.webp"
            width={1920}
            height={1200}
            loading="lazy"
            alt={t('Shopi seller dashboard on a laptop: sales today, orders that need you, the last 7 days and best sellers')}
            className="w-full rounded-[20px] shadow-[0_1px_2px_rgb(10_10_10/0.06),0_40px_80px_-40px_rgb(10_10_10/0.35)] ring-1 ring-line md:rounded-[28px]"
          />
          <img
            src="/images/shopi-seller-dashboard-phone.webp"
            width={780}
            height={1688}
            loading="lazy"
            alt=""
            className="absolute -right-6 -bottom-12 hidden w-[230px] rounded-[36px] border-[8px] border-[#0b0b0b] shadow-[0_40px_80px_-30px_rgb(10_10_10/0.5)] lg:block"
          />
        </div>
        <p className="mt-6 text-center text-[13px] text-muted lg:mt-16">{t('Demo shop with example data')}</p>
      </Container>
    </section>
  )
}

/* ---------- Everything else ---------- */

function Features() {
  const t = useT()
  const items = [
    [Link2, t('Your own link'), 'shopi.tz/dukalako'],
    [Ruler, t('Sizes and stock'), t('Buyers pick a size, sold out shows by itself')],
    [Smartphone, 'Lipa Namba', t('With a check of the payment SMS')],
    [Banknote, t('Cash on delivery'), t('Turn it on or off')],
    [MapPin, t('Delivery areas'), t('Your areas, fees agreed on WhatsApp')],
    [WhatsAppIcon, 'WhatsApp', t('Every buyer one tap away')],
    [ChartColumn, t('Your numbers'), t('Sales, visits, shares, best sellers')],
    [ImageDown, t('Light photos'), t('Shrunk on upload to save buyers data')],
  ] as const
  return (
    <section className="py-20 md:py-28">
      <Container>
        <H2 className="max-w-[720px]">{t('Everything a small shop needs')}</H2>
        <div className="mt-12 grid gap-x-10 border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([Icon, title, sub]) => (
            <div key={title} className="flex gap-4 border-b border-line py-6">
              <Icon size={20} strokeWidth={1.5} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-medium">{title}</p>
                <p className="mt-1 text-[14px] leading-5 text-muted">{sub}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-[14px] text-muted">{t('Coming next: the Shopi assistant, which answers buyers’ questions, and weekly best-product votes.')}</p>
      </Container>
    </section>
  )
}

/* ---------- Pricing ---------- */

function Pricing({ start }: { start: string }) {
  const t = useT()
  return (
    <section id="pricing" className="scroll-mt-24 py-20 md:py-28">
      <Container>
        <div className="max-w-[40rem]">
          <H2>{t('Two plans, paid once a year')}</H2>
          <Lead className="mt-6">{t('Every shop starts with 14 days free, or 30 when you finish setting up. No commission on your sales, ever.')}</Lead>
        </div>
        <div className="mt-10 grid gap-4 md:mt-14 lg:grid-cols-2 lg:gap-6">
          {PLANS.map((p, i) => (
            <div key={p.name} className={`flex flex-col rounded-[32px] p-3 ${i === 1 ? 'bg-ink text-white' : 'bg-card'}`}>
              <div className={`rounded-[24px] p-6 md:p-8 ${i === 1 ? 'bg-white/[0.08]' : 'bg-page'}`}>
                <p className="title text-[22px]">{p.name}</p>
                <p className={`mt-1 text-[15px] ${i === 1 ? 'text-white/70' : 'text-ink-2'}`}>{t(p.lead)}</p>
                <p className="mt-5 flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-[20px] font-medium md:text-[24px]">TSh</span>
                  <span className="display text-[56px] md:text-[72px]">{p.price.toLocaleString('en-US')}</span>
                  <span className={`text-[15px] ${i === 1 ? 'text-white/70' : 'text-muted'}`}>/ {t('year')}</span>
                </p>
              </div>
              <ul className="flex-1 space-y-3 px-6 pt-6 text-[15px] md:px-8">
                {p.items.map((x) => (
                  <li key={x} className="flex items-start gap-3">
                    <Check size={17} strokeWidth={2} className="mt-[3px] shrink-0" /> {t(x)}
                  </li>
                ))}
              </ul>
              <div className="p-6 md:p-8">
                <Link to={start} className={`btn btn-lg w-full ${i === 1 ? 'bg-white text-ink' : ''}`}>
                  {t('Start 14 days free')}
                </Link>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[14px] text-muted">{t('Pay by mobile money. If a plan ends unpaid, your shop takes a break and nothing is deleted.')}</p>
      </Container>
    </section>
  )
}

/* ---------- FAQ ---------- */

function Faq() {
  const t = useT()
  const qs = [
    [t('What does Shopi cost?'), t('Every shop starts with 14 days free, or 30 when you finish setting up. Then Twiga is TSh 49,000 a year and Tembo TSh 99,000 a year. We take no commission on your sales.')],
    [t('How do I get paid?'), t('The buyer pays your Lipa Namba or pays cash on delivery, the way they already pay sellers today. The money never passes through Shopi.')],
    [t('How do I know a buyer really paid?'), t('The buyer pastes the payment SMS. We check the amount, the name and the transaction ID, and refuse one already used. Still check your phone before you confirm.')],
    [t('Do I need a website or a developer?'), t('No. You open the shop on your phone in a few minutes and get a link to share.')],
    [t('Who does the delivery?'), t('You do, with your own rider. You list the areas you deliver to, the buyer picks one when ordering, and you agree the delivery fee on WhatsApp.')],
    [t('What can I sell?'), t('Clothes, shoes, cosmetics, perfumes, electronics, food and more. Illegal goods are not allowed.')],
  ]
  return (
    <section id="faq" className="scroll-mt-24 py-20 md:py-28">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-20">
        <H2>{t('Good to know')}</H2>
        <div className="border-t border-line">
          {qs.map(([q, a]) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[17px] font-medium md:text-[18px] [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown size={20} strokeWidth={1.5} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="-mt-2 max-w-[60ch] pb-6 text-[16px] leading-relaxed text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  )
}

/* ---------- Closing and footer: one dark block that ends on the logo ---------- */

function Finale({ start, startLabel, signedIn }: { start: string; startLabel: string; signedIn: boolean }) {
  const t = useT()
  const cols: { title: string; links: [string, string][] }[] = [
    {
      title: t('Product'),
      links: [
        ['#how', t('How it works')],
        ['#pay', t('Payments')],
        ['#pricing', t('Pricing')],
        ['#faq', t('Questions')],
      ],
    },
    {
      title: t('Sellers'),
      links: [[start, signedIn ? t('My shop') : t('Open a shop')], ...(signedIn ? [] : ([['/login', t('Log in')]] as [string, string][]))],
    },
  ]
  return (
    <section className="px-2 pb-2 md:px-4 md:pb-4">
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[32px] bg-ink text-white md:rounded-[40px]">
        <div className="px-6 pt-20 pb-20 text-center md:pt-32 md:pb-28">
          <h2 className="display text-[52px] sm:text-[80px] lg:text-[112px]">
            {t('Your shop in one link')}<span className="text-moto">.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-[30rem] text-[17px] text-white/65 md:text-[18px]">{t('Your buyers are already on their phones. Open your shop today and share the link tonight.')}</p>
          <Link to={start} className="btn btn-lg mt-10 bg-white text-ink hover:bg-white/90">
            {startLabel} <ArrowRight size={18} strokeWidth={1.75} />
          </Link>
        </div>

        <footer className="border-t border-white/10">
          <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-14 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1.2fr] md:px-10">
            <p className="max-w-[22rem] text-[15px] leading-relaxed text-white/60">{t('An online shop in one link, for sellers on Instagram, TikTok and WhatsApp in Tanzania.')}</p>
            {cols.map((c) => (
              <div key={c.title}>
                <p className="text-[13px] text-white/40">{c.title}</p>
                <ul className="mt-4 space-y-3 text-[15px]">
                  {c.links.map(([href, label]) => (
                    <li key={label}>
                      {href.startsWith('#') ? (
                        <a href={href} className="text-white/75 transition-colors hover:text-white">
                          {label}
                        </a>
                      ) : (
                        <Link to={href} className="text-white/75 transition-colors hover:text-white">
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="text-[13px] text-white/40">{t('Company')}</p>
              <ul className="mt-4 space-y-3 text-[15px] text-white/75">
                <li>Driftmark Technologies Limited</li>
                <li>Dar es Salaam, Tanzania</li>
                <li>
                  <Link to="/terms" className="transition-colors hover:text-white">
                    {t('Terms')}
                  </Link>
                  <span className="text-white/30"> · </span>
                  <Link to="/privacy" className="transition-colors hover:text-white">
                    {t('Privacy')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mx-auto flex max-w-[1280px] flex-col gap-3 border-t border-white/10 px-6 py-6 text-[13px] text-white/40 md:flex-row md:items-center md:justify-between md:px-10">
            <p>© {new Date().getFullYear()} Driftmark Technologies Limited</p>
            <p className="flex items-center gap-2.5">
              {t('Payments powered by')}
              <img src="/images/settlopay-dark.svg" alt="Settlo Pay" width={306} height={100} className="h-[20px] w-auto" />
            </p>
            <p>{t('Shopi never holds buyers’ money. Sellers are paid directly.')}</p>
          </div>
          <div aria-hidden className="px-4 pt-6 pb-4 md:px-10 md:pt-10 md:pb-10">
            <Wordmark className="block h-auto w-full text-white" title="" />
          </div>
        </footer>
      </div>
    </section>
  )
}
