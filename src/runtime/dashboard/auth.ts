import type { H3Event } from 'h3'
import process from 'node:process'
import { defineEventHandler, getMethod, getRequestHeader, setResponseHeader, setResponseHeaders, setResponseStatus } from 'h3'
import { getDashboardUserId, handleDashboardOAuth } from './oauth'
import { dashboardAccessFor } from './permissions'
import { renderAccessDeniedPage, renderSignInPage } from './signin'

function privateOrigin() {
  const origin = process.env.DISCORD_DASHBOARD_ORIGIN
  const url = origin && URL.canParse(origin) ? new URL(origin) : undefined
  if (!url || url.origin !== origin)
    return
  if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    return url
}

function rejectAccess(event: H3Event, status: 401 | 403, path: string) {
  setResponseStatus(event, status)
  if ((path === '/' || path === '/discord' || path.startsWith('/discord/'))
    && getMethod(event) === 'GET' && getRequestHeader(event, 'accept')?.includes('text/html')) {
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    setResponseHeader(event, 'content-security-policy', 'default-src \'none\'; style-src \'unsafe-inline\'; form-action \'self\'; base-uri \'none\'; frame-ancestors \'none\'')
    return status === 401 ? renderSignInPage() : renderAccessDeniedPage()
  }
  return status === 401 ? 'Sign in to the dashboard.' : 'Forbidden'
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'cache-control': 'private, no-store',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
  })

  const url = privateOrigin()
  const clientId = process.env.DISCORD_CLIENT_ID
  if (!url || !clientId || !/^\d+$/.test(clientId) || !process.env.DISCORD_TOKEN) {
    setResponseStatus(event, 503)
    return 'Dashboard access is not configured.'
  }

  const method = getMethod(event)
  const path = event.path.split('?')[0]!
  const requestOrigin = getRequestHeader(event, 'origin')
  const write = !['GET', 'HEAD'].includes(method)
  const navigation = getRequestHeader(event, 'sec-fetch-mode') === 'navigate'
    && getRequestHeader(event, 'sec-fetch-dest') === 'document'
  if (getRequestHeader(event, 'host')?.toLowerCase() !== url.host
    || (getRequestHeader(event, 'sec-fetch-site') === 'cross-site' && (write || !navigation))
    || ((write || requestOrigin !== undefined) && requestOrigin !== url.origin)) {
    setResponseStatus(event, 403)
    return 'Forbidden'
  }

  if (['/__discord-auth/login', '/__discord-auth/callback', '/__discord-auth/logout'].includes(path))
    return handleDashboardOAuth(event, url, clientId)

  const userId = getDashboardUserId(event, url)
  if (!userId)
    return rejectAccess(event, 401, path)
  const access = await dashboardAccessFor(userId, method, path)
  if (access === 'unavailable') {
    setResponseStatus(event, 503)
    return 'Discord access verification is temporarily unavailable.'
  }
  if (access === 'forbidden')
    return rejectAccess(event, 403, path)
  if (path === '/__discord-auth/session') {
    if (method === 'GET' || method === 'HEAD')
      return { access }
    setResponseHeader(event, 'allow', 'GET, HEAD')
    setResponseStatus(event, 405)
    return 'Method not allowed'
  }
})
