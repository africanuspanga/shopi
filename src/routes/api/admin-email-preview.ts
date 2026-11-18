import { createFileRoute } from '@tanstack/react-router'
import { currentUser } from '#/server/auth'
import { renderEmail, sampleEmail } from '#/server/email-templates'
import { EMAIL_KINDS, type EmailKind } from '#/lib/email'
import { asLang } from '#/lib/i18n'

/** /admin: an email as sellers would get it, with sample data: /api/admin-email-preview?kind=receipt&lang=sw. Admins only. */
export const Route = createFileRoute('/api/admin-email-preview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser()
        if (!user?.is_admin) return new Response('Not found', { status: 404 })
        const q = new URL(request.url).searchParams
        const kind = (EMAIL_KINDS as readonly string[]).includes(q.get('kind') ?? '') ? (q.get('kind') as EmailKind) : 'added'
        const mail = renderEmail(kind, sampleEmail(kind, Date.now()), asLang(q.get('lang')), kind === 'weekly' ? 'https://shopi.tz/email/off?preview=1' : undefined)
        // The logo from this server, so a preview before a deploy (or locally) shows it too.
        const origin = new URL(request.url).origin
        const body = q.get('text') ? mail.text : mail.html.replaceAll('https://shopi.tz/brand/', `${origin}/brand/`)
        return new Response(body, { headers: { 'content-type': q.get('text') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
      },
    },
  },
})
