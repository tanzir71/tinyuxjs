import fs from 'node:fs'

const src = fs.readFileSync('tinyux.js', 'utf8')
const bannerMatch = src.match(/^\/\*[\s\S]*?\*\//)
const banner = bannerMatch ? bannerMatch[0] + '\n' : ''
let body = src.replace(/^\/\*[\s\S]*?\*\//, '')
body = body
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}();,:=+\-*/<>[\]])\s*/g, '$1')
  .trim()

fs.writeFileSync('tinyux.min.js', banner + body + '\n')
console.log(`tinyux.min.js ${Buffer.byteLength(banner + body)} bytes`)
