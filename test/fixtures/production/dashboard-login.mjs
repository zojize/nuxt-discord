import assert from 'node:assert/strict'

// Drives the real dashboard routes against the Discord provider in transport.mjs.
export async function signInDashboard(origin, account) {
  const start = await fetch(new URL('/__discord-auth/login', origin), { redirect: 'manual' })
  assert.equal(start.status, 303)
  const authorize = new URL(start.headers.get('location'))
  assert.equal(authorize.href.split('?')[0], 'https://discord.com/oauth2/authorize')
  const callback = new URL(authorize.searchParams.get('redirect_uri'))
  assert.equal(callback.origin, new URL(origin).origin)
  assert.equal(callback.pathname, '/__discord-auth/callback')
  callback.searchParams.set('code', `${account}.${authorize.searchParams.get('code_challenge')}`)
  callback.searchParams.set('state', authorize.searchParams.get('state'))
  const response = await fetch(callback, { redirect: 'manual', headers: { cookie: getCookiePair(start, 'login') } })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/discord')
  return getCookiePair(response, 'session')
}

function getCookiePair(response, kind) {
  const cookie = response.headers.getSetCookie().find(header => header.startsWith(`nuxt_discord_${kind}=`) || header.startsWith(`__Host-nuxt_discord_${kind}=`))
  assert.ok(cookie)
  return cookie.split(';')[0]
}
