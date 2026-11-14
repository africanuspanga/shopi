import handler from '@tanstack/react-start/server-entry'
import { runJob } from '#/server/jobs'

// The Worker: TanStack Start answers requests, and Cloudflare's cron triggers (wrangler.jsonc) run the jobs.
export default {
  fetch: (request) => handler.fetch(request),
  async scheduled(controller) {
    await runJob(controller.cron)
  },
} satisfies ExportedHandler<Env>
