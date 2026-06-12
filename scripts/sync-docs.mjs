import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const out = path.join(root, 'docs')
const files = [
  'index.html',
  'docs.html',
  'compare.html',
  'example.html',
  'hotjar-alternative.html',
  'fullstory-alternative.html',
  'logrocket-alternative.html',
  'posthog-alternative.html',
  'site.css',
  'site.js',
  'tinyux.js',
  'tinyux.min.js',
  'collect.php',
  'schema.sql',
  'README.md',
  'llms.txt',
  'robots.txt',
  'sitemap.xml'
]

fs.mkdirSync(out, { recursive: true })
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(out, file))
}

const demoOut = path.join(out, 'demo')
fs.mkdirSync(demoOut, { recursive: true })
fs.copyFileSync(path.join(root, 'demo', 'product.html'), path.join(demoOut, 'product.html'))

console.log(`synced ${files.length + 1} files to docs/`)
