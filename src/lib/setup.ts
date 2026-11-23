/**
 * The five-step setup (roadmap `o-flow`, decision n1; 18 Nov 2026): one decision per screen, every step can be passed
 * in one tap, and a seller who leaves comes back to where they stopped.
 *
 * 1 Your shop (name, link, what it sells) · 2 Your first product (or service) · 3 How buyers pay (or your working
 * hours) · 4 Your shop is live · 5 Your orders (or bookings) on this phone. `shops.setup_step` keeps the furthest step passed (NULL for shops opened before it went live, which
 * never see the setup); the step shown is the next one, skipping what the shop's data already answers (a product from
 * an import, a Lipa Namba from Shop settings). Safe in the browser.
 */
export const SETUP_STEPS = 5

export type SetupOutcome = 'done' | 'skip'

/**
 * The step to show, or null when the shop has finished the setup or never had it. A business that sells services
 * (roadmap `v-services`) is asked for its first service at step 2 and its working hours at step 3, where a shop that
 * sells products is asked for a product and how buyers pay. A business that sends invoices (roadmap `v-invoices`) is asked
 * how it appears on invoices at step 2, how clients pay it at step 3, and sends its first invoice at step 4.
 */
export function nextSetupStep(s: {
  setup: number | null
  products: number
  lipa: boolean
  kind?: string
  services?: number
  hours?: boolean
  /** A business that sends invoices (roadmap `v-invoices`): its invoice settings saved, bank details given, invoices made. */
  bill?: boolean
  bank?: boolean
  invoices?: number
}): number | null {
  if (s.setup == null || s.setup >= SETUP_STEPS) return null
  const serves = s.kind === 'services'
  const bills = s.kind === 'invoices'
  let next = Math.max(1, s.setup + 1)
  if (next === 2 && (bills ? !!s.bill : serves ? (s.services ?? 0) > 0 : s.products > 0)) next = 3
  if (next === 3 && (bills ? s.lipa || !!s.bank : serves ? !!s.hours : s.lipa)) next = 4
  // A business that sends invoices sends its first one at step 4 (where a shop sees its link go live).
  if (next === 4 && bills && (s.invoices ?? 0) > 0) next = 5
  return next
}

/** Whether the setup is still open for this shop: Home sends the seller back to it. */
export const inSetup = (setup: number | null | undefined) => setup != null && setup < SETUP_STEPS

/**
 * A seller of products has a shop ("duka"); a salon and a business that sends invoices have a page ("ukurasa"), the
 * founder's words of 23 Nov 2026. The setup's titles and buttons, and Home's first cards, follow it; the app's own
 * menu still says Shop and Shop settings for everyone.
 */
export const hasPage = (kind: string | null | undefined) => kind === 'services' || kind === 'invoices'
