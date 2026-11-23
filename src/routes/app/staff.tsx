import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { ShareActions, prettyUrl } from '#/components/share'
import { TemboLock } from '#/components/tembo'
import { Card, Empty, ErrorText, Field, FieldGroup, Page, Sheet, ShopAvatar, TopBar } from '#/components/ui'
import { addStaff, getStaff, newStaffLink, removeStaff, setStaffRole } from '#/lib/api/staff'
import { localPhone, timeAgo } from '#/lib/format'
import { eg, useLang, useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'
import { INVITE_DAYS, ROLE_LINES, ROLE_NAMES, STAFF_ROLES, type StaffRole } from '#/lib/staff'

export const Route = createFileRoute('/app/staff')({
  loader: () => getStaff(),
  head: () => ({ meta: [{ title: 'Shop assistants · Shopi' }] }),
  component: StaffPage,
})

type Staff = Awaited<ReturnType<typeof getStaff>>['staff'][number]
type Invite = { name: string; phone: string; code: string }

/**
 * Shop assistants (roadmap `t-staff`, the founder's answers of 18 Nov 2026): up to 2 people who help run a Tembo shop,
 * each with a role and their own login. The owner adds one, sends the invite link on WhatsApp, and can change a role
 * or remove them at any time. Rules in src/lib/staff.ts.
 */
function StaffPage() {
  const t = useT()
  const data = Route.useLoaderData()
  const [adding, setAdding] = useState(false)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [editing, setEditing] = useState<Staff | null>(null)
  const full = data.staff.length >= data.max
  return (
    <Page nav>
      <TopBar back="/app/shop" title={t('Shop assistants')} sub={t('Up to 2 people who help run your shop, each with their own login.')} />

      {!data.can && (
        <TemboLock
          className="mb-4"
          title={t('Shop assistants come with Tembo')}
          body={
            data.staff.length
              ? t('Your assistants are paused until Tembo renews. Nothing was deleted: they come back as they were.')
              : t('Add up to 2 people to help with orders or products, each with their own login, so you never share your password.')
          }
        />
      )}

      {data.staff.length === 0 && data.can && (
        <Empty
          icon={<UsersRound size={24} strokeWidth={1.75} />}
          title={t('No assistants yet')}
          body={t('Add someone who helps with your orders, your products or the whole shop. They get their own login, so you never share your password.')}
          action={
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              <Plus size={16} strokeWidth={2.25} /> {t('Add an assistant')}
            </button>
          }
        />
      )}

      <div className="space-y-3">
        {data.staff.map((s) => (
          <StaffCard key={s.id} s={s} paused={!data.can} onInvite={setInvite} onEdit={() => setEditing(s)} />
        ))}
      </div>

      {data.can && data.staff.length > 0 && (
        <div className="mt-4">
          {full ? (
            <p className="text-13 text-muted">{t('A shop has up to 2 assistants. Remove one to add someone else.')}</p>
          ) : (
            <button type="button" className="btn btn-ghost w-full" onClick={() => setAdding(true)}>
              <Plus size={16} strokeWidth={2.25} /> {t('Add an assistant')}
            </button>
          )}
        </div>
      )}

      <Card className="mt-6" title={t('What each role can do')}>
        <ul className="space-y-3">
          {STAFF_ROLES.map((r) => (
            <li key={r}>
              <p className="text-14 font-medium">{t(ROLE_NAMES[r])}</p>
              <p className="text-14 leading-relaxed text-muted">{t(ROLE_LINES[r])}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-13 leading-relaxed text-muted">{t('Only a Manager sees sales figures. Anyone who handles orders sees each order’s total, to take payment.')}</p>
      </Card>

      <AddSheet open={adding} onClose={() => setAdding(false)} onMade={setInvite} />
      <InviteSheet invite={invite} owner={data.owner} shop={data.shop} onClose={() => setInvite(null)} />
      <EditSheet s={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}

function StaffCard({ s, paused, onInvite, onEdit }: { s: Staff; paused: boolean; onInvite: (i: Invite) => void; onEdit: () => void }) {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Dar_es_Salaam' })
  const linkWorks = !s.joined_at && !!s.invite_until && s.invite_until > Date.now()
  const status = paused
    ? t('Paused until Tembo renews')
    : s.joined_at
      ? [t('Joined {date}', { date: date(s.joined_at) }), s.last_seen ? t('Last log-in: {ago}', { ago: timeAgo(s.last_seen, lang) }) : ''].filter(Boolean).join(' · ')
      : linkWorks
        ? t('Invite sent. The link works until {date}.', { date: date(s.invite_until!) })
        : t('The invite link ended. Send a new one.')
  return (
    <section className="card p-5 md:p-6">
      <div className="flex items-start gap-3">
        <ShopAvatar name={s.name} logo={null} className="h-10 w-10 text-14" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-15 font-semibold">{s.name}</p>
            <span className="inline-flex h-6 items-center rounded-full bg-well px-2.5 text-12 font-medium text-ink-2">{t(ROLE_NAMES[s.role])}</span>
          </div>
          <p className="meta mt-0.5">{localPhone(s.phone)}</p>
          {/* "Last log-in: 1m ago" can tick over between the server's page and the phone's: not an error. */}
          <p className={`mt-2 text-13 ${!paused && !s.joined_at && !linkWorks ? 'text-moto-ink' : 'text-muted'}`} suppressHydrationWarning>
            {status}
          </p>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex flex-wrap gap-2">
        {!s.joined_at && !paused && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                const res = await newStaffLink({ data: { id: s.id } })
                if ('error' in res) return setError(res.error === 'limit' ? t('Too many invite links in an hour. Try again later.') : t('Not saved. Check your connection and try again.'))
                onInvite({ name: s.name, phone: s.phone, code: res.code })
                await router.invalidate()
              } catch {
                setError(t('Not saved. Check your connection and try again.'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('Send the link again')}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
          {t('Change role or remove')}
        </button>
      </div>
    </section>
  )
}

/** The three roles as rows to pick from, each with what it can do. */
function RoleChoice({ value, onChange }: { value: StaffRole | null; onChange: (r: StaffRole) => void }) {
  const t = useT()
  return (
    <FieldGroup label={t('What they can do')} radio>
      <div className="grid gap-2">
        {STAFF_ROLES.map((r) => {
          const on = value === r
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(r)}
              className={`flex items-start gap-3 rounded-14 border px-4 py-3.5 text-left transition-colors ${on ? 'border-ink bg-page' : 'border-line-strong hover:bg-page'}`}
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-ink' : 'border-line-strong'}`}>
                {on && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
              </span>
              <span className="min-w-0">
                <span className="block text-15 font-medium">{t(ROLE_NAMES[r])}</span>
                <span className="block text-13 leading-relaxed text-muted">{t(ROLE_LINES[r])}</span>
              </span>
            </button>
          )
        })}
      </div>
    </FieldGroup>
  )
}

function AddSheet({ open, onClose, onMade }: { open: boolean; onClose: () => void; onMade: (i: Invite) => void }) {
  const t = useT()
  const router = useRouter()
  const [form, setForm] = useState<{ name: string; phone: string; role: StaffRole | null }>({ name: '', phone: '', role: null })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => {
    setForm({ name: '', phone: '', role: null })
    setError('')
    onClose()
  }
  const errors: Record<string, string> = {
    name: t('Enter their name.'),
    phone: t('Enter a phone number, like 0754 123 456.'),
    role: t('Choose what they can do.'),
    self: t('That is your own number. Add your assistant’s number.'),
    same: t('This number is already on your list.'),
    full: t('A shop has up to 2 assistants. Remove one to add someone else.'),
    has_shop: t('This number already runs a shop on Shopi, and one login runs one shop. Add another number of theirs.'),
    limit: t('Too many invite links in an hour. Try again later.'),
    tembo: t('Shop assistants come with Tembo.'),
  }
  return (
    <Sheet open={open} onClose={close} title={t('Add an assistant')}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            const res = await addStaff({ data: { name: form.name, phone: form.phone, role: form.role ?? '' } })
            if ('error' in res) return setError(errors[res.error ?? ''] ?? t('Not saved. Check your connection and try again.'))
            const made = { name: form.name.trim(), phone: form.phone, code: res.code }
            close()
            onMade(made)
            await router.invalidate()
          } catch {
            setError(t('Not saved. Check your connection and try again.'))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label={t('Their name')}>
          <input className="input" autoComplete="off" placeholder={eg(t, 'Asha')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t('Their phone number')} hint={t('They log in with this number and a password they choose.')}>
          <input className="input" type="tel" inputMode="tel" autoComplete="off" placeholder={eg(t, '0754 123 456')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <RoleChoice value={form.role} onChange={(role) => setForm({ ...form, role })} />
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-lg w-full" disabled={busy || !form.name.trim() || !form.phone.trim() || !form.role}>
          {busy ? t('Making the link') : t('Make the invite link')}
        </button>
      </form>
    </Sheet>
  )
}

/** The link to send, right after it is made: WhatsApp to their number first. */
function InviteSheet({ invite, owner, shop, onClose }: { invite: Invite | null; owner: string; shop: string; onClose: () => void }) {
  const t = useT()
  const origin = useOrigin()
  const url = invite ? `${origin}/join/${invite.code}` : ''
  return (
    <Sheet open={!!invite} onClose={onClose} title={invite ? t('Send {name} the link', { name: invite.name }) : ''}>
      {invite && (
        <>
          <p className="text-14 leading-relaxed text-muted">
            {t('They open it on their phone and choose a password. The link works once, for {days} days.', { days: INVITE_DAYS })}
          </p>
          <p className="code mt-4 truncate rounded-12 bg-page px-3.5 py-3 text-13 text-ink-2">{prettyUrl(url)}</p>
          <div className="mt-3">
            <ShareActions
              url={url}
              phone={invite.phone}
              title={t('Help run {shop} on Shopi', { shop })}
              text={t('Hi {name}, {owner} added you to help run {shop} on Shopi. Open this link to choose your password:', { name: invite.name, owner, shop })}
            />
          </div>
          <p className="mt-4 text-13 leading-relaxed text-muted">{t('Anyone with this link can join as this assistant, so send it only to them.')}</p>
          <button type="button" className="btn btn-ghost mt-6 w-full" onClick={onClose}>
            {t('Done')}
          </button>
        </>
      )}
    </Sheet>
  )
}

function EditSheet({ s, onClose }: { s: Staff | null; onClose: () => void }) {
  const t = useT()
  const router = useRouter()
  const [role, setRole] = useState<StaffRole | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = role ?? s?.role ?? null
  const close = () => {
    setRole(null)
    setConfirm(false)
    setError('')
    onClose()
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await router.invalidate()
      close()
    } catch {
      setError(t('Not saved. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={!!s} onClose={close} title={s?.name ?? ''}>
      {s &&
        (confirm ? (
          <div>
            <p className="text-15 leading-relaxed">{t('Remove {name}?', { name: s.name })}</p>
            <p className="mt-1.5 text-14 leading-relaxed text-muted">
              {s.joined_at
                ? t('They are logged out and can’t open your shop again. You can add them back later.')
                : t('Their invite link stops working. You can add them back later.')}
            </p>
            <ErrorText>{error}</ErrorText>
            <div className="mt-6 flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setConfirm(false)}>
                {t('Keep them')}
              </button>
              <button type="button" className="btn flex-1 bg-transparent text-bad hover:bg-bad/[0.06]" disabled={busy} onClick={() => act(() => removeStaff({ data: { id: s.id } }))}>
                {t('Remove')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <RoleChoice value={current} onChange={setRole} />
            <ErrorText>{error}</ErrorText>
            <button
              type="button"
              className="btn btn-lg w-full"
              disabled={busy || !current || current === s.role}
              onClick={() => act(() => setStaffRole({ data: { id: s.id, role: current! } }))}
            >
              {t('Save')}
            </button>
            <button type="button" className="btn w-full bg-transparent text-bad hover:bg-bad/[0.06]" onClick={() => setConfirm(true)}>
              {t('Remove {name}', { name: s.name })}
            </button>
          </div>
        ))}
    </Sheet>
  )
}
