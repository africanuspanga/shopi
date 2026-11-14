import { Bell, Check, Download, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ErrorText, Toast } from '#/components/ui'
import { useT } from '#/lib/i18n'
import { usePhoneApp } from '#/lib/push'

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
        <Bell size={19} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 pr-8 md:pr-0">
        <h2 className="text-[16px] font-semibold">{t('Get new orders as notifications')}</h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">
          {app.ios
            ? t('On iPhone, add Shopi to your Home Screen first: tap Share, then Add to Home Screen. Open Shopi from there and turn on notifications.')
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
              <Bell size={15} strokeWidth={1.75} /> {t('Turn on notifications')}
            </button>
          )}
          {app.canInstall && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={app.install}>
              <Download size={15} strokeWidth={1.75} /> {t('Install the app')}
            </button>
          )}
        </div>
      )}
      {app.ios && <Share size={20} strokeWidth={1.6} className="hidden shrink-0 text-muted md:block" aria-hidden />}
      <button type="button" className="icon-btn absolute top-3 right-3 h-9 w-9 md:static md:shrink-0" aria-label={t('Not now')} onClick={notNow}>
        <X size={17} strokeWidth={1.6} />
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
        <p className="min-h-5 text-[15px] leading-6">{status}</p>
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
          <p className="flex items-center gap-2 text-[14px] text-ink-2">
            <Check size={16} strokeWidth={2} className="text-ok" /> {t('Shopi is installed on this phone.')}
          </p>
        ) : app.canInstall ? (
          <button type="button" className="btn btn-ghost" onClick={app.install}>
            <Download size={16} strokeWidth={1.75} /> {t('Install the app')}
          </button>
        ) : (
          <p className="text-[14px] leading-5 text-muted">
            {app.ios
              ? t('To install Shopi on iPhone: tap Share in Safari, then Add to Home Screen.')
              : t('To install Shopi, open your browser’s menu and choose Install app or Add to Home screen.')}
          </p>
        )}
      </div>
      <Toast show={done || tested === 'sent'}>
        <Check size={16} strokeWidth={2.25} /> {tested === 'sent' ? t('Test sent. It shows up in a few seconds.') : t('Notifications are on')}
      </Toast>
    </div>
  )
}
