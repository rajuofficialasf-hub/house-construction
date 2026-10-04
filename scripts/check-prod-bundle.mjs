// প্রোডাকশন বিল্ডে মক ব্যাকএন্ড (হার্ড-কোডেড টেস্ট অ্যাডমিনসহ) থাকে না — VITE_HOUSING_BACKEND=mock সেট করেও।
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'housing-prod-bundle-'))
const r = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_HOUSING_BACKEND: 'mock' },
})
if (r.status !== 0) process.exit(r.status ?? 1)

const MARKERS = ['housing_mock_state', '__housingMock', 'admin@example.test', '__mock-photos']
const hits = []
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(js|css|html|json)$/.test(f)) {
      const text = fs.readFileSync(p, 'utf8')
      for (const m of MARKERS) if (text.includes(m)) hits.push(`${m} in ${path.relative(out, p)}`)
    }
  }
}
walk(out)
fs.rmSync(out, { recursive: true, force: true })
if (hits.length) {
  console.error('✗ production bundle contains mock backend code:\n  ' + hits.join('\n  '))
  process.exit(1)
}
console.log('✓ production bundle contains no mock backend code')
