/**
 * Reads a seller's product sheet in the browser: Excel (.xlsx), CSV or TSV files, or rows pasted from a sheet.
 * No library: an .xlsx file is a zip of XML files, so the zip is read here with the browser's own inflate
 * (DecompressionStream) and the XML with DOMParser.
 */

/** One row as the sheet numbers it (row 1 is the top row), with its cells left to right. Empty rows are left out. */
export type SheetRow = { n: number; cells: string[] }

export type SheetProblem = 'xls' | 'unreadable' | 'empty' | 'big'
export class SheetError extends Error {
  constructor(public problem: SheetProblem) {
    super(problem)
  }
}

export const SHEET_ACCEPT = '.xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_FILE = 20_000_000
/** More rows than any import takes; past this the rest of the sheet is not read. */
const MAX_ROWS = 5000

export async function readSheetFile(file: File): Promise<SheetRow[]> {
  if (file.size > MAX_FILE) throw new SheetError('big')
  const buf = await file.arrayBuffer()
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength))
  let rows: SheetRow[]
  // "PK": a zip, so .xlsx. D0 CF: the old Excel 97-2003 format, which only Excel itself reads well.
  if (b[0] === 0x50 && b[1] === 0x4b) rows = await readXlsx(buf)
  else if (b[0] === 0xd0 && b[1] === 0xcf) throw new SheetError('xls')
  else rows = parseDelimited(decode(buf))
  if (!rows.length) throw new SheetError('empty')
  return rows
}

/** CSV saved by Excel on Windows is often not UTF-8; then its accents come out as replacement marks. */
function decode(buf: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** Rows pasted from Excel or Google Sheets come tab-separated; a pasted CSV works too. */
export function parseDelimited(text: string): SheetRow[] {
  text = text.replace(/^﻿/, '')
  const firstLine = text.slice(0, 2000).split(/\r?\n/, 1)[0]
  const tally = (c: string) => firstLine.split(c).length - 1
  const delim = tally('\t') ? '\t' : tally(';') > tally(',') ? ';' : ','
  const rows: SheetRow[] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let n = 1
  const endRow = () => {
    row.push(cell)
    if (row.some((c) => c.trim())) rows.push({ n, cells: row.map((c) => c.trim()) })
    row = []
    cell = ''
    n++
  }
  for (let i = 0; i < text.length && rows.length < MAX_ROWS; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') cell += c
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (c === '"' && !cell.trim()) {
      cell = ''
      quoted = true
    } else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else cell += c
  }
  if (cell || row.length) endRow()
  return rows
}

/* ---------- .xlsx ---------- */

type Entry = () => Promise<string>

/** The files inside a zip, each read only when asked for. Sizes come from the central directory. */
function unzip(buf: ArrayBuffer): Map<string, Entry> {
  const v = new DataView(buf)
  let end = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new SheetError('unreadable')
  const files = new Map<string, Entry>()
  const names = new TextDecoder()
  let p = v.getUint32(end + 16, true)
  for (let k = v.getUint16(end + 10, true); k > 0 && p + 46 <= buf.byteLength; k--) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const local = v.getUint32(p + 42, true)
    const name = names.decode(new Uint8Array(buf, p + 46, nameLen))
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true)
    files.set(name, async () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
      const data = new Uint8Array(buf, start, size)
      if (method === 0) return new TextDecoder().decode(data)
      if (method !== 8) throw new SheetError('unreadable')
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new Response(stream).text()
    })
  }
  return files
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const tags = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS('*', name))
const kids = (node: Element, name: string) => Array.from(node.children).filter((e) => e.localName === name)
/** An attribute by its local name, whatever namespace prefix the file uses (r:id, x:r). */
const attr = (el: Element, name: string) => Array.from(el.attributes).find((a) => a.localName === name)?.value ?? null
/** The text of a string item, without the phonetic runs (rPh) some files carry. */
const textOf = (el: Element) =>
  tags(el, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('')

/** "C12" -> 2 */
function columnOf(ref: string) {
  let n = 0
  for (const ch of ref.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

async function readXlsx(buf: ArrayBuffer): Promise<SheetRow[]> {
  const files = unzip(buf)
  const read = async (name: string) => {
    const entry = files.get(name)
    return entry ? xml(await entry()) : null
  }
  const book = await read('xl/workbook.xml')
  if (!book) throw new SheetError('unreadable')
  const rels = await read('xl/_rels/workbook.xml.rels')
  const target = (id: string | null) => {
    const to = rels && tags(rels, 'Relationship').find((r) => r.getAttribute('Id') === id)?.getAttribute('Target')
    if (!to) return null
    return to.startsWith('/') ? to.slice(1) : `xl/${to.replace(/^\.\//, '')}`
  }
  const sheets = tags(book, 'sheet')
    .filter((s) => (s.getAttribute('state') ?? 'visible') === 'visible')
    .map((s) => target(attr(s, 'id')))
    .filter((p): p is string => !!p && files.has(p))
  if (!sheets.length && files.has('xl/worksheets/sheet1.xml')) sheets.push('xl/worksheets/sheet1.xml')
  const strings = await read('xl/sharedStrings.xml')
  const shared = strings ? tags(strings, 'si').map(textOf) : []

  // The first visible sheet with something in it.
  for (const path of sheets) {
    const doc = await read(path)
    if (!doc) continue
    const rows: SheetRow[] = []
    let last = 0
    for (const r of tags(doc, 'row')) {
      const n = Number(r.getAttribute('r')) || last + 1
      last = n
      const cells: string[] = []
      let col = 0
      for (const c of kids(r, 'c')) {
        const ref = c.getAttribute('r')
        if (ref) col = columnOf(ref)
        const type = c.getAttribute('t')
        const v = kids(c, 'v')[0]?.textContent ?? ''
        const value =
          type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? textOf(c) : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : type === 'e' ? '' : v
        if (col < 200) cells[col] = value.trim()
        col++
      }
      for (let i = 0; i < cells.length; i++) cells[i] ??= ''
      if (cells.some(Boolean)) rows.push({ n, cells })
      if (rows.length >= MAX_ROWS) break
    }
    if (rows.length) return rows
  }
  return []
}
