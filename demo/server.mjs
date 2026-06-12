import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT || 8787)
const events = []

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 2_000_000) req.destroy()
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

function send(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}

function withCors(headers = {}) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept'
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.md') return 'text/markdown; charset=utf-8'
  if (ext === '.sql') return 'text/plain; charset=utf-8'
  if (ext === '.txt') return 'text/plain; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8'
  return 'application/octet-stream'
}

function serveFile(res, filePath) {
  try {
    const buf = fs.readFileSync(filePath)
    send(res, 200, { 'Content-Type': contentTypeFor(filePath) }, buf)
  } catch {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found')
  }
}

function staticPath(urlPath) {
  const safe = path.normalize(urlPath).replace(/^([.][.][\/\\])+/, '')
  const filePath = path.join(rootDir, safe)
  if (!filePath.startsWith(rootDir)) return null
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath
  return null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') {
    send(res, 204, withCors(), '')
    return
  }

  if (req.method === 'POST' && url.pathname === '/collect') {
    const raw = await readBody(req)
    let parsed
    try { parsed = JSON.parse(raw) } catch { parsed = { raw } }
    events.push({ receivedAt: new Date().toISOString(), ip: req.socket.remoteAddress || '', data: parsed })
    while (events.length > 500) events.shift()
    send(res, 204, withCors({ 'Content-Type': 'application/json; charset=utf-8' }), '')
    return
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    send(res, 200, withCors({ 'Content-Type': 'application/json; charset=utf-8' }), JSON.stringify({ ok: true, count: events.length, events }))
    return
  }

  if (req.method !== 'GET') {
    send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed')
    return
  }

  if (url.pathname === '/') {
    serveFile(res, path.join(rootDir, 'index.html'))
    return
  }
  if (url.pathname === '/docs') {
    serveFile(res, path.join(rootDir, 'docs.html'))
    return
  }
  if (url.pathname === '/compare') {
    serveFile(res, path.join(rootDir, 'compare.html'))
    return
  }
  if (url.pathname === '/demo') {
    serveFile(res, path.join(rootDir, 'demo', 'product.html'))
    return
  }

  const filePath = staticPath(url.pathname)
  if (filePath) {
    serveFile(res, filePath)
    return
  }

  send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found')
})

server.listen(PORT, () => {
  process.stdout.write(`tinyux demo server: http://localhost:${PORT}/\n`)
  process.stdout.write(`demo:               http://localhost:${PORT}/demo/product.html\n`)
  process.stdout.write(`collector:          http://localhost:${PORT}/collect\n`)
  process.stdout.write(`events:             http://localhost:${PORT}/events\n`)
})
