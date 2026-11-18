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
    /**
     * Tembo billing (src/server/selcom.ts): Driftmark's signing proxy for Selcom, the same one CV Chap Chap uses
     * (`http://selcom-proxy.shopi.tz`, an A record to the whitelisted droplet, DNS only) and its bearer token. Worker
     * secrets; locally `.dev.vars` points at a fake proxy, because the real one moves real money.
     */
    SELCOM_PROXY_URL?: string
    SELCOM_PROXY_TOKEN?: string
  }
}
