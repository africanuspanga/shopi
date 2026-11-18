#!/usr/bin/env node
/**
 * The design check (DESIGN.md): every screen uses the scales in src/styles.css, so the app looks like one product no
 * matter which session built a screen. Run `npm run check:design`; it must pass before anything is called done.
 *
 * It fails on: a typed font size (text-[15px]) or one off the scale (text-16); a typed radius (rounded-[18px]) or one
 * off the scale; a raw hex colour in a class (bg-[#0b0b0b]); an icon size or line weight off the icon scale. And on the
 * signs of a shared part rebuilt by hand (DESIGN.md, "The shared parts"): a hand-styled card heading, a bare label, an
 * overlay, a hand-made switch, a local function named like a shared part.
 * A file whose first lines say `design-check: off` is skipped (the coded pictures in showcase.tsx, drawn at their own
 * small scale). Change a scale in styles.css and here together, and say why in DESIGN.md.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TEXT = [11, 12, 13, 14, 15, 17, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 112]
const RADIUS = [2, 4, 8, 12, 14, 16, 20, 28, 32, 40]
const ICON = [12, 14, 16, 18, 20, 24]
const STROKE = ['1.75', '2.25']

const RULES = [
  [/(?<![\w-])text-\[[0-9.]+px\]/g, () => `typed font size: use text-N (${TEXT.join(', ')})`],
  [/(?<![\w-])rounded(?:-[a-z]{1,2})?-\[[0-9.]+px\]/g, () => `typed radius: use rounded-N (${RADIUS.join(', ')}) or rounded-full`],
  [/(?<![\w-])(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow)-\[#[0-9a-fA-F]{3,8}\]/g, () => 'raw hex colour: use a colour token (bg-ink, text-muted…)'],
  [/(?<![\w-])text-(\d+)(?![\w.[-])/g, (m) => (TEXT.includes(Number(m[1])) ? null : `text-${m[1]} is not on the type scale (${TEXT.join(', ')})`)],
  [/(?<![\w-])rounded(?:-[a-z]{1,2})?-(\d+)(?![\w.[-])/g, (m) => (RADIUS.includes(Number(m[1])) ? null : `rounded-${m[1]} is not on the radius scale (${RADIUS.join(', ')})`)],
  [/\bsize=\{([0-9.]+)\}/g, (m) => (ICON.includes(Number(m[1])) ? null : `icon size ${m[1]}: use ${ICON.join(', ')}`)],
  [/\bstrokeWidth=\{([0-9.]+)\}/g, (m) => (STROKE.includes(m[1]) ? null : `icon line weight ${m[1]}: use 1.75, or 2.25 for small bold marks`)],
]

// The shared parts (DESIGN.md) live in these files; elsewhere, the signs of one being rebuilt are flagged. A real
// exception says why on its line or the line before: {/* design-check: allow <reason> */}.
const PART_FILES = ['src/components/ui.tsx', 'src/components/admin.tsx']
const PARTS = ['Card', 'CardHead', 'Stat', 'Kpi', 'Nothing', 'Notice', 'PageHead', 'TopBar', 'PhoneBar', 'Field', 'FieldGroup', 'Label', 'Sheet', 'Switch', 'Empty']
const ROLE_RULES = [
  [/<h[23]\b[^>]*className=[{`"'][^"'`]*\b(?:text-1[57]\b[^"'`]*font-semibold|font-semibold[^"'`]*\btext-1[57]\b)/g, 'a card heading built by hand: use CardHead'],
  [/className=[{`"'](?:[^"'`]*\s)?label(?:\s[^"'`]*)?["'`]/g, 'a label built by hand: use Field, FieldGroup or Label'],
  [/\bfixed inset-0\b/g, 'an overlay built by hand: use Sheet'],
  [/role="switch"/g, 'a switch built by hand: use Switch'],
  [new RegExp(`^\\s*(?:export\\s+)?function\\s+(${PARTS.join('|')})\\b`, 'g'), 'a shared part declared again: import it from components/ui.tsx'],
]

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (name.endsWith('.tsx')) yield path
  }
}

const problems = []
let checked = 0
for (const path of files(join(ROOT, 'src'))) {
  const text = readFileSync(path, 'utf8')
  if (text.slice(0, 400).includes('design-check: off')) continue
  checked++
  const rel = relative(ROOT, path)
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const [re, why] of RULES) {
      for (const m of line.matchAll(re)) {
        const msg = why(m)
        if (msg) problems.push(`${rel}:${i + 1}  ${m[0]}  ${msg}`)
      }
    }
    if (PART_FILES.includes(rel)) return
    if (/design-check: allow/.test(line) || /design-check: allow/.test(lines[i - 1] ?? '')) return
    for (const [re, msg] of ROLE_RULES) {
      for (const m of line.matchAll(re)) problems.push(`${rel}:${i + 1}  ${m[0].trim().slice(0, 60)}  ${msg}`)
    }
  })
}

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`\ndesign check: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${checked} files (DESIGN.md has the scales)`)
  process.exit(1)
}
console.log(`design check: ok (${checked} files)`)
