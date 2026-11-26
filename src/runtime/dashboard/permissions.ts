import type { APIApplication } from 'discord.js'
import process from 'node:process'

type DashboardRole = 'manage' | 'read'
type DashboardAccess = DashboardRole | 'forbidden' | 'unavailable'

const readPaths = new Set([
  '/',
  '/favicon.ico',
  '/discord',
  '/discord/slash-commands',
  '/discord/context-menus',
  '/discord/listeners',
  '/discord/activity',
  '/__discord-auth/session',
  '/api/discord/catalog',
  '/api/discord/activity',
  '/api/discord/slash-command/all',
  '/api/discord/slash-command/remote-all',
])

function isReadRequest(method: string, pathname: string) {
  if (method === 'POST')
    return pathname === '/api/discord/slash-command/remote-diff'
  if (method !== 'GET' && method !== 'HEAD')
    return false
  // Asset segments must start with a filename character, excluding dot segments
  // and alternate encodings that could resolve to a different server route.
  return readPaths.has(pathname)
    || /^\/_nuxt\/(?:[\w@-][\w.@-]*\/)*[\w@-][\w.@-]*$/.test(pathname)
    || /^\/api\/_nuxt_icon\/[\w-]+(?:\.json)?$/.test(pathname)
}

function isId(id: unknown): id is string {
  return typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id)
}

async function loadRoles(appId: string, token: string): Promise<Map<string, DashboardRole> | undefined> {
  try {
    const response = await fetch('https://discord.com/api/v10/applications/@me', {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok)
      return
    const application: APIApplication = await response.json()
    if (application?.id !== appId)
      return
    const roles = new Map<string, DashboardRole>()
    const team = application.team
    if (team === null && isId(application.owner?.id)) {
      roles.set(application.owner.id, 'manage')
      return roles
    }
    if (!isId(team?.owner_user_id) || !Array.isArray(team.members))
      return
    for (const member of team.members) {
      if (member?.membership_state !== 2 || !isId(member.user?.id))
        continue
      if (member.role === 'admin' || member.role === 'developer')
        roles.set(member.user.id, 'manage')
      else if (member.role === 'read_only')
        roles.set(member.user.id, 'read')
    }
    // Discord represents team ownership separately from the member's role.
    roles.set(team.owner_user_id, 'manage')
    return roles
  }
  catch {
    // Operational errors can contain request headers. Return only the outcome.
    return undefined
  }
}

let cache: { appId: string, token: string, expires: number, roles: ReturnType<typeof loadRoles> } | undefined

export async function dashboardAccessFor(userId: string, method: string, pathname: string): Promise<DashboardAccess> {
  if (!isId(userId))
    return 'forbidden'
  const { DISCORD_CLIENT_ID: appId, DISCORD_TOKEN: token } = process.env
  if (!isId(appId) || !token) {
    cache = undefined
    return 'unavailable'
  }

  const read = isReadRequest(method, pathname)
  if (!read || !cache || cache.appId !== appId || cache.token !== token || Date.now() >= cache.expires)
    cache = { appId, token, expires: Date.now() + 15_000, roles: loadRoles(appId, token) }
  const source = cache
  const roles = await source.roles
  if (!roles) {
    if (cache === source)
      cache = undefined
    return 'unavailable'
  }
  const role = roles.get(userId)
  if (role === 'manage' || (read && role === 'read'))
    return role
  return 'forbidden'
}
