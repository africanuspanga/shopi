import { createFileRoute } from '@tanstack/react-router'
import { imgUrl } from '#/lib/format'
import { SITE } from '#/lib/seo'
import { all } from '#/server/db'

/** Pages anyone can land on that aren't shops. */
const PAGES = ['/', '/signup', '/terms', '/privacy', '/data-deletion']

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

/**
 * Every page search engines should know about: the landing and legal pages, each live shop with at least one product,
 * its products (with their photos, for image search) and its collections that have products. Demo shops and hidden
 * products are left out, like they are from the shop itself. Addresses always name shopi.tz (see SITE).
 */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const [shops, products, collections] = await Promise.all([
          all<{ slug: string }>(
            `SELECT s.slug FROM shops s WHERE s.status = 'active' AND EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id AND p.active = 1) ORDER BY s.created_at`,
          ),
          all<{ shop: string; slug: string | null; id: string; images: string }>(
            `SELECT s.slug AS shop, p.slug, p.id, p.images FROM products p JOIN shops s ON s.id = p.shop_id
             WHERE s.status = 'active' AND p.active = 1 ORDER BY s.created_at, p.created_at DESC`,
          ),
          all<{ shop: string; slug: string }>(
            `SELECT s.slug AS shop, c.slug FROM collections c JOIN shops s ON s.id = c.shop_id
             WHERE s.status = 'active' AND EXISTS (
               SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = c.id AND p.active = 1
             ) ORDER BY s.created_at, c.sort`,
          ),
        ])
        const url = (path: string, images: string[] = []) =>
          `<url><loc>${xml(SITE + path)}</loc>${images.map((k) => `<image:image><image:loc>${xml(SITE + imgUrl(k))}</image:loc></image:image>`).join('')}</url>`
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
          ...PAGES.map((p) => url(p)),
          ...shops.map((s) => url(`/${s.slug}`)),
          ...collections.map((c) => url(`/${c.shop}/c/${c.slug}`)),
          ...products.map((p) => url(`/${p.shop}/${p.slug ?? p.id}`, (JSON.parse(p.images) as string[]).slice(0, 5))),
          '</urlset>',
        ].join('\n')
        return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
      },
    },
  },
})
