import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ChatMarkdown } from './ChatMarkdown'

it('renders AI emphasis and bullet points instead of showing markdown markers', () => {
  const html = renderToStaticMarkup(<ChatMarkdown text={'Sembilan karyawan tersebar di lima divisi:\n\n* **DIVISI PENGADAAN STRATEGIS:** 2 orang\n* **DIVISI KEUANGAN:** 2 orang'}/>)
  expect(html).toContain('<ul>')
  expect(html).toContain('<strong>DIVISI PENGADAAN STRATEGIS:</strong>')
  expect(html).toContain('<li>')
  expect(html).not.toContain('**')
})
