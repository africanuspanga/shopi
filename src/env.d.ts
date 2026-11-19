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
    /**
     * AI for sellers (src/server/ai.ts), any OpenAI-compatible API: the key, and optionally its base URL and model.
     * Live: Groq (19 Nov 2026), AI_BASE_URL and AI_MODEL in wrangler.jsonc, the key as the secret AI_API_KEY. Locally
     * `.dev.vars` holds a Groq test key. Without a key the AI buttons stay hidden.
     */
    AI_API_KEY?: string
    OPENAI_API_KEY?: string
    AI_BASE_URL?: string
    AI_MODEL?: string
    /**
     * Email to sellers (src/server/email.ts): a Resend API key for shopi.tz (domain verified 17 Nov 2026, sending as
     * hello@shopi.tz). A Worker secret; not in .dev.vars, so local runs print emails instead of sending them.
     */
    RESEND_API_KEY?: string
  }
}
