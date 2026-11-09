/**
 * Who is asking, from the user agent. The bot list is adapted from Minilytics (MIT, github.com/surendrapandar/minilytics).
 * Real browsers, in-app ones included, always start with "Mozilla/"; link previews (WhatsApp, Facebook), scripts and
 * crawlers mostly don't, and the rest name themselves.
 */
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pingdom|uptime|monitor|chatgpt-user|gptbot|claudebot|perplexity|bytespider|ahrefs|semrush|mj12|dotbot/i

export function isBot(ua: string) {
  return !ua || !ua.startsWith('Mozilla/') || BOT_RE.test(ua)
}

export type Device = 'android' | 'iphone' | 'computer' | 'tablet' | 'other'

export function deviceOf(ua: string): Device {
  if (/iPhone|iPod/.test(ua)) return 'iphone'
  if (/iPad|Tablet/.test(ua)) return 'tablet'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'android' : 'tablet'
  if (/Windows|Macintosh|Mac OS X|CrOS|Linux/.test(ua)) return 'computer'
  return 'other'
}
