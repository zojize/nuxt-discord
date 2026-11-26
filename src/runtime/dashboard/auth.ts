import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { defineEventHandler, getMethod, getRequestHeader, setResponseHeader, setResponseHeaders, setResponseStatus } from 'h3'

// A hosted dashboard is a dedicated, private Nuxt origin. Protect the whole
// app so new routes and alternate render paths inherit the same boundary.
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'cache-control': 'private, no-store',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
  })

  const verifier = process.env.DISCORD_DASHBOARD_PASSWORD_SHA256
  const origin = process.env.DISCORD_DASHBOARD_ORIGIN
  const url = origin && URL.canParse(origin) ? new URL(origin) : undefined
  const secure = url?.protocol === 'https:'
    || (url?.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  if (!verifier || !/^[a-f0-9]{64}$/i.test(verifier) || !url || !secure || url.origin !== origin) {
    setResponseStatus(event, 503)
    return 'Dashboard access is not configured.'
  }

  const requestOrigin = getRequestHeader(event, 'origin')
  const write = !['GET', 'HEAD'].includes(getMethod(event))
  const navigation = getRequestHeader(event, 'sec-fetch-mode') === 'navigate'
    && getRequestHeader(event, 'sec-fetch-dest') === 'document'
  if (getRequestHeader(event, 'host')?.toLowerCase() !== url.host
    || (getRequestHeader(event, 'sec-fetch-site') === 'cross-site' && (write || !navigation))
    || ((write || requestOrigin !== undefined) && requestOrigin !== origin)) {
    setResponseStatus(event, 403)
    return 'Forbidden'
  }

  const authorization = getRequestHeader(event, 'authorization')
  const encoded = authorization?.match(/^Basic ([A-Z0-9+/]+=*)$/i)?.[1]
  if (encoded) {
    const credentials = Buffer.from(encoded, 'base64').toString('utf8')
    if (credentials.startsWith('admin:')) {
      const digest = createHash('sha256').update(credentials.slice(6)).digest()
      if (timingSafeEqual(digest, Buffer.from(verifier, 'hex')))
        return
    }
  }

  setResponseStatus(event, 401)
  setResponseHeader(event, 'www-authenticate', 'Basic realm="Nuxt Discord dashboard", charset="UTF-8"')
  return 'Sign in to the dashboard.'
})
