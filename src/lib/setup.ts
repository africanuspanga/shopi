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
 * sells products is asked for a product and how buyers pay.
 */
export function nextSetupStep(s: { setup: number | null; products: number; lipa: boolean; kind?: string; services?: number; hours?: boolean }): number | null {
  if (s.setup == null || s.setup >= SETUP_STEPS) return null
  const serves = s.kind === 'services'
  let next = Math.max(1, s.setup + 1)
  if (next === 2 && (serves ? (s.services ?? 0) > 0 : s.products > 0)) next = 3
  if (next === 3 && (serves ? !!s.hours : s.lipa)) next = 4
  return next
}

/** Whether the setup is still open for this shop: Home sends the seller back to it. */
export const inSetup = (setup: number | null | undefined) => setup != null && setup < SETUP_STEPS
