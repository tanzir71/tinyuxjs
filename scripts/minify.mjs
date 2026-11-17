// Builds tinyux.min.js with esbuild (the only dev dependency) and reports the gzip size.
// Usage: npm install && npm run build:min
import fs from 'node:fs'
import zlib from 'node:zlib'

let esbuild
try {
  esbuild = await import('esbuild')
} catch {
  console.error('esbuild is not installed. Run `npm install` (it is the only devDependency) and try again.')
  process.exit(1)
}

const src = fs.readFileSync('tinyux.js', 'utf8')
const version = (src.match(/TINYUX_VERSION = '([^']+)'/) || [])[1] || 'dev'
const { code } = await esbuild.transform(src, {
  minify: true,
  target: 'es5',
  legalComments: 'none',
  banner: `/*! tinyux v${version} | MIT | github.com/tanzir71/tinyuxjs */`
})

fs.writeFileSync('tinyux.min.js', code)
const gz = zlib.gzipSync(code, { level: 9 }).length
const budget = JSON.parse(fs.readFileSync('package.json', 'utf8')).sizeBudget?.gzipBytes
console.log(`tinyux.min.js ${Buffer.byteLength(code)} bytes, ${gz} bytes gzipped${budget ? ` (budget ${budget})` : ''}`)
if (budget && gz > budget) {
  console.error('Size budget exceeded.')
  process.exitCode = 1
}
