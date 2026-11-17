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
  'landing.css',
  'site.css',
  'site.js',
  'tinyux.js',
  'tinyux.min.js',
  'collect.php',
  'schema.sql',
  'README.md',
  'CHANGELOG.md',
  'llms.txt',
  'robots.txt',
  'sitemap.xml'
]

fs.mkdirSync(out, { recursive: true })
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(out, file))
}

const nested = [
  path.join('demo', 'product.html'),
  path.join('assets', 'logo.svg'),
  path.join('assets', 'logo-blue.svg')
]
for (const file of nested) {
  fs.mkdirSync(path.join(out, path.dirname(file)), { recursive: true })
  fs.copyFileSync(path.join(root, file), path.join(out, file))
}

console.log(`synced ${files.length + nested.length} files to docs/`)
