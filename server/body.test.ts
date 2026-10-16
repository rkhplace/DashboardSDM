import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { acceptedContentType, parseBody } from './body'

describe('request bodies', () => {
  it('reads plain and gzip-compressed JSON alike', async () => {
    expect(await parseBody(Buffer.from('{"a":1}'))).toEqual({ a: 1 })
    expect(await parseBody(gzipSync('{"a":2}'))).toEqual({ a: 2 })
  })

  it('rejects bodies that inflate past the cap, broken gzip and broken JSON', async () => {
    const bomb = gzipSync(Buffer.alloc(70 * 1024 * 1024, 32))
    expect(bomb.length).toBeLessThan(4 * 1024 * 1024)
    await expect(parseBody(bomb)).rejects.toMatchObject({ status: 413 })
    await expect(parseBody(Buffer.from([0x1f, 0x8b, 1, 2, 3]))).rejects.toMatchObject({ status: 400, code: 'INVALID_BODY' })
    await expect(parseBody(Buffer.from('{oops'))).rejects.toMatchObject({ status: 400, code: 'INVALID_JSON' })
  })

  it('accepts JSON and raw bytes only', () => {
    expect(acceptedContentType('application/json; charset=utf-8')).toBe(true)
    expect(acceptedContentType('application/octet-stream')).toBe(true)
    expect(acceptedContentType('text/plain')).toBe(false)
    expect(acceptedContentType(undefined)).toBe(false)
  })
})
