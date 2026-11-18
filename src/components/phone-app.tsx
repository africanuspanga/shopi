import { Bell, Check, Download, EllipsisVertical, Share, Smartphone, SquarePlus, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ErrorText, Sheet, Toast } from '#/components/ui'
import { useT } from '#/lib/i18n'
import { inAppBrowser, usePhoneApp } from '#/lib/push'

const HIDE_KEY = 'shopi_alerts_card'
const HIDE_FOR = 14 * 86400_000

/** Turns notifications on, then sends a sample so the seller sees what a new order looks like. */
function useTurnOn(app: ReturnType<typeof usePhoneApp>) {
  const t = useT()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  async function on() {
    setError('')
    const res = await app.turnOn()
    if (res === 'ok') {
      setDone(true)
      setTimeout(() => setDone(false), 2600)
      app.test()
    } else if (res === 'error') setError(t('Notifications didn’t turn on. Try again.'))
  }
  return { on, error, done }
}

/** On Home: one card until notifications are on (and Shopi installed where the phone offers it), or "Not now". */
export function PhoneAlertsCard() {
  const t = useT()
  const app = usePhoneApp()
  const { on, error, done } = useTurnOn(app)
  const [guide, setGuide] = useState(false)
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try {
      setHidden(Date.now() - Number(localStorage.getItem(HIDE_KEY) ?? 0) < HIDE_FOR)
    } catch {
      setHidden(false)
    }
  }, [])
  const needed = app.state === 'off' || app.state === 'ios' || (app.state === 'on' && app.canInstall)
  if (hidden || !needed) return <Toast show={done}><Check size={16} strokeWidth={2.25} /> {t('Notifications are on')}</Toast>

  function notNow() {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now()))
    } catch {
      /* storage blocked */
    }
    setHidden(true)
  }

  return (
    <section className="card relative mt-6 flex flex-col gap-4 p-5 md:mt-8 md:flex-row md:items-center md:gap-6 md:p-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        <Bell size={20} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 pr-8 md:pr-0">
        <h2 className="text-15 font-semibold">{t('Get new orders as notifications')}</h2>
        <p className="mt-1 text-14 leading-5 text-muted">
          {app.ios
            ? t('On iPhone, put Shopi on your Home Screen first. Then open it from there and turn on notifications.')
            : t('A notification the moment a buyer orders, even when Shopi is closed.')}
        </p>
        {error && (
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </div>
      {!app.ios && (
        <div className="flex flex-wrap gap-2 md:shrink-0">
          {app.state === 'off' && (
            <button type="button" className="btn btn-sm" disabled={app.busy} onClick={on}>
              <Bell size={16} strokeWidth={1.75} /> {t('Turn on notifications')}
            </button>
          )}
          {app.canInstall && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={app.install}>
              <Download size={16} strokeWidth={1.75} /> {t('Install the app')}
            </button>
          )}
        </div>
      )}
      {app.ios && (
        <div className="md:shrink-0">
          <button type="button" className="btn btn-sm" onClick={() => setGuide(true)}>
            {t('Show me how')}
          </button>
        </div>
      )}
      <InstallSheet open={guide} onClose={() => setGuide(false)} app={app} />
      <button type="button" className="icon-btn absolute top-3 right-3 h-9 w-9 md:static md:shrink-0" aria-label={t('Not now')} onClick={notNow}>
        <X size={18} strokeWidth={1.75} />
      </button>
    </section>
  )
}

/** In Shop settings: this phone's notifications and the app, whatever their state. */
export function PhoneAppSettings() {
  const t = useT()
  const app = usePhoneApp()
  const { on, error, done } = useTurnOn(app)
  const [tested, setTested] = useState<'' | 'sent' | 'failed'>('')
  const [guide, setGuide] = useState(false)

  async function test() {
    setTested((await app.test()) ? 'sent' : 'failed')
    setTimeout(() => setTested(''), 3200)
  }

  const status =
    app.state === 'on'
      ? t('On for this phone. You get a notification for each new order and each payment to check.')
      : app.state === 'off'
        ? t('Off on this phone.')
        : app.state === 'blocked'
          ? t('Notifications are blocked for shopi.tz on this phone. Allow them in your browser’s site settings, then come back.')
          : app.state === 'ios'
            ? t('On iPhone, add Shopi to your Home Screen first: tap Share, then Add to Home Screen. Open Shopi from there and turn on notifications.')
            : app.state === 'unsupported'
              ? t('This browser can’t show notifications. On Android use Chrome; on iPhone use Safari and add Shopi to your Home Screen.')
              : ''

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${app.state === 'on' ? 'bg-ok' : 'bg-faint'}`} aria-hidden />
        <p className="min-h-5 text-15 leading-6">{status}</p>
      </div>
      <ErrorText>{error || (tested === 'failed' ? t('The test didn’t send. Turn notifications off and on again.') : '')}</ErrorText>
      {(app.state === 'on' || app.state === 'off') && (
        <div className="flex flex-wrap gap-2">
          {app.state === 'off' ? (
            <button type="button" className="btn" disabled={app.busy} onClick={on}>
              <Bell size={16} strokeWidth={1.75} /> {t('Turn on notifications')}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" disabled={app.busy} onClick={test}>
                {t('Send a test')}
              </button>
              <button type="button" className="btn btn-ghost" disabled={app.busy} onClick={app.turnOff}>
                {t('Turn off')}
              </button>
            </>
          )}
        </div>
      )}
      <div className="border-t border-line pt-5">
        {app.installed ? (
          <p className="flex items-center gap-2 text-14 text-ink-2">
            <Check size={16} strokeWidth={2.25} className="text-ok" /> {t('Shopi is installed on this phone.')}
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-15 font-medium">{t('Put Shopi on your Home Screen')}</p>
              <p className="mt-0.5 text-14 leading-5 text-muted">{t('It opens like an app, one tap from your orders.')}</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => (app.canInstall ? app.install() : setGuide(true))}>
              <Download size={16} strokeWidth={1.75} /> {app.canInstall ? t('Install the app') : t('Show me how')}
            </button>
          </div>
        )}
      </div>
      <InstallSheet open={guide} onClose={() => setGuide(false)} app={app} />
      <Toast show={done || tested === 'sent'}>
        <Check size={16} strokeWidth={2.25} /> {tested === 'sent' ? t('Test sent. It shows up in a few seconds.') : t('Notifications are on')}
      </Toast>
    </div>
  )
}

/** The + sheet's row: only while Shopi isn't on this phone's Home Screen. */
export function InstallRow({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  const app = usePhoneApp()
  const [guide, setGuide] = useState(false)
  if (app.installed || app.state === 'loading') return null
  return (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-4 rounded-16 bg-page px-4 py-4 text-left transition-colors hover:bg-well"
        onClick={() => {
          if (app.canInstall) {
            onOpen()
            app.install()
          } else setGuide(true)
        }}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink ring-1 ring-line-strong">
          <Smartphone size={20} strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-15 font-medium">{t('Put Shopi on your Home Screen')}</span>
          <span className="block text-13 text-muted">{t('It opens like an app, one tap from your orders.')}</span>
        </span>
      </button>
      <InstallSheet open={guide} onClose={() => setGuide(false)} app={app} />
    </>
  )
}

/**
 * How to put Shopi on the Home Screen, in three pictures. iPhone has no install prompt, so Safari's Share menu is the
 * only way; other browsers get their menu's steps (or the one-tap Install where Chrome offers it).
 */
export function InstallSheet({ open, onClose, app }: { open: boolean; onClose: () => void; app: ReturnType<typeof usePhoneApp> }) {
  const t = useT()
  const [inApp, setInApp] = useState(false)
  useEffect(() => setInApp(inAppBrowser()), [])
  const steps: { title: string; sub: string; art: ReactNode }[] = app.apple
    ? [
        { title: t('Tap Share'), sub: t('The square with an arrow, at the bottom of Safari.'), art: <BarArt icon={<Share size={18} strokeWidth={1.75} />} bottom /> },
        { title: t('Choose Add to Home Screen'), sub: t('Scroll down the list if you don’t see it.'), art: <MenuArt icon={<SquarePlus size={16} strokeWidth={1.75} />} /> },
        { title: t('Open Shopi from your Home Screen'), sub: t('Then turn on notifications for new orders.'), art: <HomeArt /> },
      ]
    : [
        { title: t('Open your browser’s menu'), sub: t('The three dots at the top of Chrome.'), art: <BarArt icon={<EllipsisVertical size={18} strokeWidth={1.75} />} /> },
        { title: t('Choose Add to Home screen'), sub: t('It may say Install app.'), art: <MenuArt icon={<Smartphone size={16} strokeWidth={1.75} />} /> },
        { title: t('Open Shopi from your Home Screen'), sub: t('Then turn on notifications for new orders.'), art: <HomeArt /> },
      ]
  return (
    <Sheet open={open} onClose={onClose} title={t('Put Shopi on your Home Screen')}>
      {app.apple && inApp && (
        <p className="mb-4 rounded-14 bg-moto-soft px-4 py-3 text-14 leading-5 text-moto-ink">{t('First open shopi.tz in Safari. This app’s own browser can’t add to the Home Screen.')}</p>
      )}
      <ol className="grid gap-3">
        {steps.map((x, i) => (
          <li key={i} className="flex items-center gap-4 rounded-16 bg-page p-3">
            {x.art}
            <div className="min-w-0">
              <p className="meta">{t('Step {n}', { n: i + 1 })}</p>
              <p className="mt-0.5 text-15 leading-5 font-medium">{x.title}</p>
              <p className="mt-1 text-13 leading-[18px] text-muted">{x.sub}</p>
            </div>
          </li>
        ))}
      </ol>
      {app.canInstall && (
        <button type="button" className="btn mt-4 w-full" onClick={() => { onClose(); app.install() }}>
          <Download size={16} strokeWidth={1.75} /> {t('Install the app')}
        </button>
      )}
    </Sheet>
  )
}

const ART = 'relative flex h-[84px] w-[84px] shrink-0 flex-col overflow-hidden rounded-14 bg-card ring-1 ring-line'

/** A browser's bar with one control picked out: Safari's is at the bottom, Chrome's at the top. */
function BarArt({ icon, bottom = false }: { icon: ReactNode; bottom?: boolean }) {
  const bar = (
    <div className={`flex h-8 items-center gap-1.5 bg-well px-2 ${bottom ? 'justify-center' : ''}`}>
      {!bottom && <span className="h-3.5 flex-1 rounded-full bg-card" />}
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white">{icon}</span>
    </div>
  )
  const page = (
    <div className="flex-1 space-y-1.5 p-2.5">
      <span className="block h-1.5 w-10 rounded-full bg-raised" />
      <span className="block h-1.5 w-14 rounded-full bg-raised" />
      <span className="block h-1.5 w-8 rounded-full bg-raised" />
    </div>
  )
  return (
    <div className={ART} aria-hidden>
      {bottom ? page : bar}
      {bottom ? bar : page}
    </div>
  )
}

/** A menu with the row to choose picked out. */
function MenuArt({ icon }: { icon: ReactNode }) {
  return (
    <div className={`${ART} justify-center gap-1.5 px-2`} aria-hidden>
      <span className="block h-2 w-12 rounded-full bg-raised" />
      <span className="flex h-6 items-center gap-1 rounded-8 bg-ink px-1.5 text-white">
        {icon}
        <span className="h-1.5 flex-1 rounded-full bg-white/70" />
      </span>
      <span className="block h-2 w-9 rounded-full bg-raised" />
    </div>
  )
}

/** A Home Screen with Shopi's icon on it. */
function HomeArt() {
  return (
    <div className={`${ART} grid grid-cols-3 content-center gap-1.5 bg-well p-2.5`} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="aspect-square rounded-4 bg-raised" />
      ))}
      <img src="/icon-192.png" alt="" className="aspect-square w-full rounded-4" />
      <span className="aspect-square rounded-4 bg-raised" />
    </div>
  )
}
