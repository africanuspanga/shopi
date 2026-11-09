import { BatteryFull, Check, CircleCheck, MapPin, Phone as PhoneIcon, Signal, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { InstagramIcon, WhatsAppMark } from '#/components/brand-icons'

/*
 * Product previews for the landing and sign-in pages, built in code with the app's own parts.
 * One story runs through all of them: Zee's Store in Sinza sells Gauni la Jua (TSh 60,000, size M)
 * to Lulu Mbwambo in Mikocheni, delivery TSh 3,000, total TSh 63,000, paid with transaction QK48ZX91.
 * Photos: Unsplash (free licence), credited in README.md.
 */
const L = '/images/landing'
const DEMO_PRODUCTS = [
  { img: `${L}/jua.webp`, name: 'Gauni la Jua', price: 'TSh 60,000', sizes: 'S · M · L · XL' },
  { img: `${L}/bahari.webp`, name: 'Kaftani ya Bahari', price: 'TSh 95,000', was: 'TSh 110,000', off: '−14%', sizes: 'Free size' },
  { img: `${L}/zumaridi.webp`, name: 'Gauni la Zumaridi', price: 'TSh 65,000', was: 'TSh 75,000', off: '−13%', sizes: 'S · M · L · XL' },
  { img: `${L}/moto.webp`, name: 'Gauni la Moto', price: 'TSh 55,000', sizes: 'S · M · L' },
]

export function Phone({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-[54px] bg-[#0b0b0b] p-[11px] shadow-[0_50px_90px_-30px_rgb(10_10_10/0.5),0_0_0_1px_rgb(10_10_10/0.9),inset_0_0_0_1.5px_rgb(255_255_255/0.12)] ${className}`}
    >
      <div className="relative h-full overflow-hidden rounded-[43px] bg-card text-ink">
        <div className="absolute top-3 left-1/2 z-30 h-[27px] w-[96px] -translate-x-1/2 rounded-full bg-[#0b0b0b]" />
        <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between px-7 pt-1 text-[13px] font-semibold">
          <span>16:12</span>
          <span className="flex items-center gap-1">
            <Signal size={14} strokeWidth={2.4} />
            <Wifi size={14} strokeWidth={2.4} />
            <BatteryFull size={18} strokeWidth={1.8} />
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Zee's Store on a phone: the same parts a buyer sees on a real RIZK shop. */
export function MiniStore() {
  return (
    <div className="relative h-full pt-12 text-ink">
      <div className="flex items-center gap-2 border-b border-line px-4 pb-3">
        <img src={`${L}/zee-logo.webp`} alt="" className="h-7 w-7 rounded-full" />
        <span className="text-[13px] font-semibold">Zee's Store</span>
        <span className="ml-auto flex h-8 items-center gap-1.5 rounded-full pr-1 pl-3 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
          Bag <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-moto px-1.5 text-[12px] text-ink">2</span>
        </span>
      </div>
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <img src={`${L}/zee-logo.webp`} alt="" className="h-12 w-12 rounded-full" />
          <div className="min-w-0">
            <p className="display text-[22px]">Zee's Store</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
              <MapPin size={11} strokeWidth={1.75} /> Sinza Mori, Dar es Salaam
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {['All 10', 'New in', 'On sale 4'].map((c, i) => (
            <span key={c} className={`flex h-7 items-center rounded-full px-3 text-[11px] font-medium ${i === 0 ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]'}`}>
              {c}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-3">
          {DEMO_PRODUCTS.map((p) => (
            <div key={p.name}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-[12px] bg-well">
                <img src={p.img} alt="" className="h-full w-full object-cover" />
                {p.off && <span className="absolute top-1.5 left-1.5 rounded-full bg-moto px-1.5 py-0.5 text-[10px] font-medium">{p.off}</span>}
              </div>
              <p className="mt-1.5 truncate text-[11px]">{p.name}</p>
              <p className="text-[11px] font-medium">{p.price}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/90 to-transparent" />
      <div className="absolute inset-x-3 bottom-4 flex h-11 items-center justify-between rounded-full bg-ink pr-1 pl-4 text-white shadow-[var(--shadow-float)]">
        <span className="text-[12px] font-medium">View bag</span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-white/70">TSh 155,000</span>
          <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-moto px-2 text-[12px] font-medium text-ink">2</span>
        </span>
      </div>
    </div>
  )
}

/** The notification a seller gets. */
export function NewOrderCard({ className = '' }: { className?: string }) {
  return (
    <div className={`w-[288px] rounded-[22px] bg-card p-4 text-ink shadow-[var(--shadow-float)] ring-1 ring-line ${className}`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="signal" /> New order
        </p>
        <p className="meta">now</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <img src={`${L}/jua.webp`} alt="" className="h-[52px] w-[42px] shrink-0 rounded-[8px] object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">Lulu Mbwambo</p>
          <p className="truncate text-[12px] text-muted">Gauni la Jua · Size M</p>
        </div>
        <p className="font-mono text-[13px]">63,000</p>
      </div>
      <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[12px] text-ink-2">
        <MapPin size={13} strokeWidth={1.75} className="shrink-0" /> Mikocheni · near Shoppers Plaza
      </p>
    </div>
  )
}

/** The signature: a receipt slip, here showing what RIZK checked in the buyer's SMS. */
export function PaymentSlip({ className = '' }: { className?: string }) {
  return (
    <div className={`w-[264px] text-ink drop-shadow-[0_18px_30px_rgb(10_10_10/0.16)] ${className}`}>
      <div className="receipt px-4 pt-4 pb-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-semibold">Payment checked</p>
          <p className="code text-[11px] text-muted">#HAN8RG</p>
        </div>
        <ul className="mt-3 space-y-2 text-[12px]">
          {[
            ['Amount', 'TSh 63,000'],
            ['Paid to', 'ZEES STORE'],
            ['Transaction', 'QK48ZX91'],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center gap-2">
              <CircleCheck size={15} strokeWidth={1.75} className="shrink-0 text-ok" />
              <span className="text-ink-2">{k}</span>
              <span className="ml-auto font-mono text-[11px]">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function LinkPreview() {
  return (
    <div className="w-full max-w-[300px] rounded-[18px] bg-card p-4 shadow-[0_1px_2px_rgb(10_10_10/0.06),0_12px_24px_-12px_rgb(10_10_10/0.18)]">
      <p className="text-[12px] font-medium">Shop link</p>
      <div className="mt-2 flex h-11 items-center gap-0.5 rounded-[12px] px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--color-ink)]">
        <span className="text-muted">rizk.tz/</span>
        <span>zees-store</span>
        <span className="ml-0.5 h-4 w-px bg-ink" />
        <span className="ml-auto flex items-center gap-1 text-[12px] text-ok">
          <Check size={13} strokeWidth={2.5} /> Available
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {['Fashion', 'Shoes', 'Cosmetics'].map((c, i) => (
          <span key={c} className={`flex h-7 items-center rounded-full px-3 text-[11px] font-medium ${i === 0 ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]'}`}>
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProductPreview() {
  return (
    <div className="flex w-full max-w-[300px] gap-3 rounded-[18px] bg-card p-3 shadow-[0_1px_2px_rgb(10_10_10/0.06),0_12px_24px_-12px_rgb(10_10_10/0.18)]">
      <img src={`${L}/jua.webp`} alt="" className="h-[120px] w-24 shrink-0 rounded-[12px] object-cover" />
      <div className="min-w-0 py-1">
        <p className="truncate text-[14px] font-medium">Gauni la Jua</p>
        <p className="text-[14px] text-ink-2">TSh 60,000</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {['S', 'M', 'L', 'XL'].map((s) => (
            <span key={s} className={`flex h-7 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-medium ${s === 'M' ? 'bg-ink text-white' : 'shadow-[inset_0_0_0_1px_var(--color-line-strong)]'}`}>
              {s}
            </span>
          ))}
        </div>
        <p className="meta mt-2">12 in stock</p>
      </div>
    </div>
  )
}

export function BioPreview() {
  return (
    <div className="w-full max-w-[300px] rounded-[18px] bg-card p-4 shadow-[0_1px_2px_rgb(10_10_10/0.06),0_12px_24px_-12px_rgb(10_10_10/0.18)]">
      <div className="flex items-center gap-3">
        <span className="rounded-full p-[2px] shadow-[0_0_0_1.5px_var(--color-ink)]">
          <img src={`${L}/zee-logo.webp`} alt="" className="h-11 w-11 rounded-full" />
        </span>
        <div className="flex flex-1 justify-around text-center">
          {[
            ['48', 'posts'],
            ['6.2k', 'followers'],
          ].map(([n, l]) => (
            <span key={l}>
              <span className="block text-[13px] font-semibold">{n}</span>
              <span className="block text-[11px] text-muted">{l}</span>
            </span>
          ))}
        </div>
        <InstagramIcon size={18} className="text-ink-2" />
      </div>
      <p className="mt-3 text-[12px] font-semibold">zees.store</p>
      <p className="text-[12px] text-ink-2">Kitenge na ankara · Sinza, Dar</p>
      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-moto-soft px-2 py-0.5 text-[12px] font-medium text-moto-ink">rizk.tz/zees-store</p>
    </div>
  )
}

/** A buyer's mobile money SMS, as it arrives on the phone. */
export function SmsBubble() {
  return (
    <div className="max-w-[340px] rounded-[22px] rounded-bl-[6px] bg-[#232220] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white/85">
      QK48ZX91 Confirmed. TSh63,000.00 paid to ZEES STORE on 9/11/26 at 4:12 PM. New balance is TSh41,250.00.
    </div>
  )
}

/** What the seller sees once an order is paid. */
export function OrderPreview({ className = '' }: { className?: string }) {
  return (
    <div className={`w-full max-w-[380px] space-y-3 text-ink ${className}`}>
      <div className="rounded-[22px] bg-card p-5 shadow-[0_1px_2px_rgb(10_10_10/0.06),0_16px_32px_-16px_rgb(10_10_10/0.2)]">
        <div className="flex items-center justify-between">
          <p className="code text-[15px]">#HAN8RG</p>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Confirmed
          </span>
        </div>
        <p className="mt-3 text-[16px] font-semibold">Paid. Pack it and send it</p>
        <div className="mt-4 grid grid-cols-4 gap-1">
          {['bg-ink', 'bg-ink', 'bg-moto', 'bg-raised'].map((c, i) => (
            <span key={i} className={`h-1.5 rounded-full ${c}`} />
          ))}
        </div>
        <div className="mt-4 flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-white">Mark as sent</div>
      </div>
      <div className="rounded-[22px] bg-card p-5 shadow-[0_1px_2px_rgb(10_10_10/0.06),0_16px_32px_-16px_rgb(10_10_10/0.2)]">
        <p className="text-[12px] text-muted">Buyer</p>
        <p className="mt-1 text-[16px] font-semibold">Lulu Mbwambo</p>
        <p className="code text-[13px] text-ink-2">+255 713 456 789</p>
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-5">
          <MapPin size={15} strokeWidth={1.6} className="mt-0.5 shrink-0 text-muted" />
          <span>
            <span className="font-medium">Mikocheni</span>
            <span className="block text-ink-2">Mikocheni B, near Shoppers Plaza, blue gate</span>
          </span>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <span className="flex h-10 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
            <PhoneIcon size={14} strokeWidth={1.6} /> Call
          </span>
          <span className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-ink text-[13px] font-medium text-white">
            <WhatsAppMark size={16} /> WhatsApp
          </span>
        </div>
      </div>
    </div>
  )
}
