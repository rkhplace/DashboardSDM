import { createApp } from './app.ts'
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

const port = Number(process.env.API_PORT || 8787)
createApp().listen(port, '127.0.0.1', () => {
  process.stdout.write(`API lokal berjalan di http://127.0.0.1:${port}\n`)
})
