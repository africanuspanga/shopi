/** The small copy's longest side: sharp in a 2-column phone grid and a 4-column desktop grid. */
const THUMB = 600

async function encode(bitmap: ImageBitmap, max: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82))
  // Older Safari cannot encode WebP and hands back PNG; use JPEG there.
  if (!blob || blob.type !== 'image/webp') blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('encode')
  return blob
}

/**
 * Shrinks a phone photo in the browser (longest side 1200px, WebP) before upload: saves the seller's data and our storage.
 * Then uploads a 600px copy for grids and thumbnails; if that fails, pages fall back to the full photo.
 */
export async function uploadImage(file: Blob, max = 1200): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const full = await encode(bitmap, max)
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': full.type }, body: full })
  if (!res.ok) throw new Error(`upload ${res.status}`)
  const { key } = (await res.json()) as { key: string }
  if (max > THUMB) {
    try {
      const small = await encode(bitmap, THUMB)
      await fetch(`/api/upload?thumb=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': small.type }, body: small })
    } catch {
      /* the full photo stands in */
    }
  }
  return key
}
