import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'

/** Largest request as sent over the wire (Vercel caps function bodies at 4.5 MB). */
export const MAX_BODY = 4 * 1024 * 1024
/** Largest body after gzip is undone; guards against a small upload that inflates to gigabytes. */
const MAX_INFLATED = 64 * 1024 * 1024

const inflate = promisify(gunzip)
type BodyError = Error & { status: number; code: string }
const fail = (status: number, code: string, message: string): BodyError => Object.assign(new Error(message), { status, code })

/** The browser sends JSON either plain or gzip-compressed; a gzip stream always starts with 1f 8b, which JSON never does. */
const isGzip = (raw: Uint8Array) => raw.length > 1 && raw[0] === 0x1f && raw[1] === 0x8b

/** Content types the API accepts: plain JSON, or compressed JSON sent as raw bytes. */
export function acceptedContentType(value: string | undefined): boolean {
  const type = value?.split(';')[0]?.trim().toLowerCase()
  return type === 'application/json' || type === 'application/octet-stream'
}

export async function readStream(stream: AsyncIterable<Buffer | string>): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.length
    if (size > MAX_BODY) throw fail(413, 'REQUEST_TOO_LARGE', 'Data melebihi batas 4 MB.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/** Turns the raw request bytes into JSON, undoing gzip first when the browser compressed them. */
export async function parseBody(raw: Buffer): Promise<unknown> {
  if (raw.length > MAX_BODY) throw fail(413, 'REQUEST_TOO_LARGE', 'Data melebihi batas 4 MB.')
  let text: string
  if (isGzip(raw)) {
    try {
      text = (await inflate(raw, { maxOutputLength: MAX_INFLATED })).toString('utf8')
    } catch (error) {
      if (error instanceof RangeError || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE')
        throw fail(413, 'REQUEST_TOO_LARGE', 'Data setelah dibuka melebihi batas 64 MB.')
      throw fail(400, 'INVALID_BODY', 'Data terkompresi tidak valid.')
    }
  } else text = raw.toString('utf8')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw fail(400, 'INVALID_JSON', 'JSON tidak valid.')
  }
}
