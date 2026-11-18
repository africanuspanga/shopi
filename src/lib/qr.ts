/**
 * A QR code encoder with no library (byte mode, versions 1 to 40, all four error-correction levels), after the reference
 * design by Project Nayuki (MIT). Shopi draws the result itself: on a canvas for the printable QR card
 * (`src/lib/qr-card.ts`) and as SVG on screen. `encodeQr(text, 'H')` returns the modules and which of them are the
 * three finder squares, so a drawing can style those apart.
 *
 * Level H (30% of the code can be lost) leaves room for a logo in the middle. Checked by decoding with the browser's
 * BarcodeDetector (macOS Vision) in the session that built it, 18 Nov 2026.
 */

export type Ecc = 'L' | 'M' | 'Q' | 'H'

export type Qr = {
  /** Modules per side. */
  size: number
  /** modules[y][x]: true is dark. */
  modules: boolean[][]
  /** True for modules that belong to the three finder patterns (the big corner squares) and their separators. */
  finder: boolean[][]
}

// Per level: the index used in the format bits, and the tables below.
const ECC_FORMAT: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 }

// Error-correction codewords per block, and number of blocks, by level and version (index 0 unused).
// prettier-ignore
const ECC_PER_BLOCK: Record<Ecc, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
}
// prettier-ignore
const BLOCKS: Record<Ecc, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0

function rawDataModules(ver: number) {
  let n = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2
    n -= (25 * align - 10) * align - 55
    if (ver >= 7) n -= 36
  }
  return n
}

const dataCodewords = (ver: number, ecc: Ecc) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver] * BLOCKS[ecc][ver]

/* ---------- Reed-Solomon over GF(256), polynomial 0x11D ---------- */

function gfMul(x: number, y: number) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function rsDivisor(degree: number) {
  const result = new Array<number>(degree - 1).fill(0)
  result.push(1)
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], divisor: number[]) {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)))
  }
  return result
}

/* ---------- Encoding ---------- */

export function encodeQr(text: string, ecc: Ecc = 'H'): Qr {
  const bytes = Array.from(new TextEncoder().encode(text))

  // The smallest version that holds the text in byte mode.
  let ver = 1
  let used = 0
  for (; ; ver++) {
    if (ver > 40) throw new Error('Text too long for a QR code')
    const countBits = ver <= 9 ? 8 : 16
    used = 4 + countBits + bytes.length * 8
    if (used <= dataCodewords(ver, ecc) * 8) break
  }

  // Mode (byte = 0100), length, data, terminator, padding.
  const bits: number[] = []
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, ver <= 9 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  const capacity = dataCodewords(ver, ecc) * 8
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  // Split into blocks, add error correction, interleave.
  const numBlocks = BLOCKS[ecc][ver]
  const eccLen = ECC_PER_BLOCK[ecc][ver]
  const raw = Math.floor(rawDataModules(ver) / 8)
  const numShort = numBlocks - (raw % numBlocks)
  const shortLen = Math.floor(raw / numBlocks)
  const divisor = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const ec = rsRemainder(dat, divisor)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(ec))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(block[i])
    })
  }

  // The grid: function patterns first, then the data, then the best mask.
  const size = ver * 4 + 17
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const isFn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const finder = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark
    isFn[y][x] = true
  }

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || x >= size || y < 0 || y >= size) continue
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        set(x, y, d !== 2 && d !== 4)
        finder[y][x] = true
      }
    }
  }
  const align = alignmentPositions(ver, size)
  const last = align.length - 1
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
  drawFormat(set, size, ecc, 0) // reserves the format areas; drawn again with the chosen mask
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const v = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, bit(v, i))
      set(b, a, bit(v, i))
    }
  }

  // Data in the zigzag order, two columns at a time from the bottom right.
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFn[y][x] && i < codewords.length * 8) {
          modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7))
          i++
        }
      }
    }
  }

  let best = 0
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, isFn, mask)
    drawFormat(set, size, ecc, mask)
    const score = penalty(modules)
    if (score < bestScore) {
      best = mask
      bestScore = score
    }
    applyMask(modules, isFn, mask) // undo
  }
  applyMask(modules, isFn, best)
  drawFormat(set, size, ecc, best)
  return { size, modules, finder }
}

function alignmentPositions(ver: number, size: number) {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const result = [6]
  for (let pos = size - 7; result.length < n; pos -= step) result.splice(1, 0, pos)
  return result
}

function drawFormat(set: (x: number, y: number, dark: boolean) => void, size: number, ecc: Ecc, mask: number) {
  const data = (ECC_FORMAT[ecc] << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i))
  set(8, 7, bit(bits, 6))
  set(8, 8, bit(bits, 7))
  set(7, 8, bit(bits, 8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i))
  set(8, size - 8, true)
}

function applyMask(modules: boolean[][], isFn: boolean[][], mask: number) {
  const size = modules.length
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFn[y][x]) continue
      let invert: boolean
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break
        case 1: invert = y % 2 === 0; break
        case 2: invert = x % 3 === 0; break
        case 3: invert = (x + y) % 3 === 0; break
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
        default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
      }
      if (invert) modules[y][x] = !modules[y][x]
    }
  }
}

/** The standard's penalty: long runs, 2x2 blocks, finder-like patterns, and an unbalanced dark share. Lower is better. */
function penalty(m: boolean[][]) {
  const size = m.length
  let score = 0
  const line = (get: (i: number) => boolean) => {
    let run = 1
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++
      else {
        if (run >= 5) score += 3 + (run - 5)
        run = 1
      }
    }
    // 1:1:3:1:1 with four light modules on one side.
    for (let i = 0; i + 11 <= size; i++) {
      const s = Array.from({ length: 11 }, (_, k) => (get(i + k) ? 1 : 0)).join('')
      if (s === '10111010000' || s === '00001011101') score += 40
    }
  }
  for (let y = 0; y < size; y++) line((x) => m[y][x])
  for (let x = 0; x < size; x++) line((y) => m[y][x])
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x]
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3
    }
  }
  let dark = 0
  for (const row of m) for (const c of row) if (c) dark++
  const total = size * size
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10
  return score
}
