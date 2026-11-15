// Bindings that `wrangler types` can't see from .dev.vars, because they only exist on the live Worker.
declare namespace Cloudflare {
  interface Env {
    /**
     * Shops' own domains (src/server/cloudflare.ts): an API token with Zone > SSL and Certificates > Edit on shopi.tz
     * and Account > Turnstile > Edit. Set by the founder with `wrangler secret put CF_API_TOKEN`; without it, custom
     * domains stay switched off.
     */
    CF_API_TOKEN?: string
    /** The Cloudflare account that owns shopi.tz and the Turnstile widget (a var in wrangler.jsonc). */
    CF_ACCOUNT_ID?: string
  }
}
