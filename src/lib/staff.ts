/**
 * Shop assistants (roadmap `t-staff`, the founder's answers of 18 Nov 2026), safe in the browser and on the server.
 * Up to STAFF_MAX people besides the owner help run a Tembo shop, each with a role and their own login. When Tembo ends
 * they are paused, never removed: they come back as they were the moment the shop renews.
 */

import { msg } from '#/lib/i18n'

export const STAFF_MAX = 2
/** An invite link works once, for this many days. */
export const INVITE_DAYS = 7

export type StaffRole = 'orders' | 'products' | 'manager'
export type Role = 'owner' | StaffRole
export const STAFF_ROLES: StaffRole[] = ['orders', 'products', 'manager']

export const asStaffRole = (v: unknown): StaffRole | null => (STAFF_ROLES.includes(v as StaffRole) ? (v as StaffRole) : null)

/**
 * What a server function or a screen needs:
 * - `orders`: orders, payment checks, recording a sale, bag links;
 * - `products`: products, photos, stock, collections, Top picks, back-in-stock lists, "Write it for me";
 * - `manage`: everything else that runs the shop, sales figures included (Home, Analytics, Shop settings, look,
 *   discount codes): a Manager;
 * - `owner`: Tembo and its payments, the own domain, how buyers pay and reach the shop (Lipa Namba, WhatsApp),
 *   email, the setup, and the assistants themselves;
 * - `any`: everyone who helps run the shop (notifications on their own phone).
 */
export type Area = 'orders' | 'products' | 'manage' | 'owner' | 'any'

const ACCESS: Record<Role, Area[]> = {
  owner: ['orders', 'products', 'manage', 'owner', 'any'],
  manager: ['orders', 'products', 'manage', 'any'],
  orders: ['orders', 'any'],
  products: ['products', 'any'],
}

/** Whether `role` may do what `area` needs; a list means any one of them is enough. */
export function allows(role: Role | null | undefined, area: Area | Area[]) {
  if (!role) return false
  const areas = Array.isArray(area) ? area : [area]
  return areas.some((a) => ACCESS[role].includes(a))
}

/** Where a role starts in the seller app: Home shows sales figures, so only the owner and a Manager see it. */
export function landing(role: Role | null | undefined): '/app' | '/app/orders' | '/app/products' {
  if (role === 'orders') return '/app/orders'
  if (role === 'products') return '/app/products'
  return '/app'
}

/** What a seller-app page needs, from its path (the /app layout sends anyone else to their own start). */
export function areaOfPath(path: string): Area {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/app') return 'manage'
  // The diary is orders work, services are products work; the working hours (/app/hours) are the shop's settings.
  if (/^\/app\/(orders|bags|bookings)(\/|$)/.test(p)) return 'orders'
  if (/^\/app\/(products|collections|services)(\/|$)/.test(p)) return 'products'
  if (/^\/app\/(plan|domain|staff)(\/|$)/.test(p)) return 'owner'
  // Shop settings: a Manager gets the shop's settings, the others their own (notifications, language, log out).
  if (/^\/app\/shop(\/|$)/.test(p)) return 'any'
  return 'manage'
}

export const ROLE_NAMES: Record<StaffRole, string> = {
  orders: msg('Orders'),
  products: msg('Products'),
  manager: msg('Manager'),
}

export const ROLE_LINES: Record<StaffRole, string> = {
  orders: msg('Sees and updates orders, checks payments, records sales and sends bag links.'),
  products: msg('Adds and edits products, photos, stock and collections.'),
  manager: msg('Everything you do, sales figures included, except Tembo, your own domain, how buyers pay and reach you, and assistants.'),
}

/** What the role means, said to the assistant (the owner's page says it to the owner). */
export const ROLE_FOR_YOU: Record<StaffRole, string> = {
  orders: msg('You see and update orders, check payments, record sales and send bag links.'),
  products: msg('You add and edit products, photos, stock and collections.'),
  manager: msg('You run the shop with the owner: orders, products, settings and sales figures. Tembo, the shop’s domain, how buyers pay and the assistants stay with the owner.'),
}
