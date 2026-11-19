import type { ScoreFacts } from '#/lib/score'

/**
 * The shop score's facts in SQL (src/lib/score.ts), as columns of a query over `shops` aliased `s`, so Home (one shop)
 * and /admin (every shop) read them the same way. Column names start with `sc_`; `scoreFacts` turns a row into facts.
 * The bio item reads buyers' visits only: the seller's own shares carry their browser's source too, and a seller who
 * signed up inside Instagram would otherwise tick it with a Copy.
 */
export const scoreSelect = `
  (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) sc_products,
  (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.active = 1 AND p.price > 0
     AND TRIM(p.description) != '' AND p.images NOT IN ('', '[]')) sc_complete,
  (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.active = 1 AND TRIM(p.description) = '') sc_no_description,
  (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.images IN ('', '[]')) sc_no_photo,
  (SELECT p.id FROM products p WHERE p.shop_id = s.id
     AND ((p.active = 1 AND TRIM(p.description) = '') OR p.images IN ('', '[]'))
     ORDER BY (p.active = 1 AND TRIM(p.description) = '') DESC, p.created_at DESC LIMIT 1) sc_fix_id,
  (s.logo_key IS NOT NULL) sc_logo,
  (s.whatsapp != '') sc_whatsapp,
  (s.lipa_number != '' OR (s.cod_enabled = 1 AND (s.setup_step IS NULL OR s.setup_step >= 3))) sc_payment,
  (s.ships_regions = 1 OR EXISTS (SELECT 1 FROM delivery_areas a WHERE a.shop_id = s.id)) sc_delivery,
  EXISTS (SELECT 1 FROM events e WHERE e.shop_id = s.id AND e.type = 'seller_share') sc_shared,
  EXISTS (SELECT 1 FROM events e WHERE e.shop_id = s.id AND e.type IN ('view_shop', 'view_product')
     AND (e.source IN ('instagram', 'tiktok') OR e.link_tag = 'bio')) sc_bio,
  (s.kind = 'services') sc_serves,
  (SELECT COUNT(*) FROM services v WHERE v.shop_id = s.id AND v.active = 1) sc_services,
  (s.book IS NOT NULL) sc_hours,
  (TRIM(s.location) != '') sc_location`

export type ScoreRow = {
  sc_products: number
  sc_complete: number
  sc_no_description: number
  sc_no_photo: number
  sc_fix_id: string | null
  sc_logo: number
  sc_whatsapp: number
  sc_payment: number
  sc_delivery: number
  sc_shared: number
  sc_bio: number
  sc_serves: number
  sc_services: number
  sc_hours: number
  sc_location: number
}

export const scoreFacts = (r: ScoreRow): ScoreFacts => ({
  products: r.sc_products ?? 0,
  complete: r.sc_complete ?? 0,
  noDescription: r.sc_no_description ?? 0,
  noPhoto: r.sc_no_photo ?? 0,
  fixId: r.sc_fix_id ?? null,
  logo: !!r.sc_logo,
  whatsapp: !!r.sc_whatsapp,
  payment: !!r.sc_payment,
  delivery: !!r.sc_delivery,
  shared: !!r.sc_shared,
  bioLink: !!r.sc_bio,
  serves: !!r.sc_serves,
  services: r.sc_services ?? 0,
  hours: !!r.sc_hours,
  location: !!r.sc_location,
})
