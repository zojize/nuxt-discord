import { defineMiddleware, MiddlewareError } from '../defineMiddleware'

const cooldowns = new Map<string, number>()

export const cooldown = defineMiddleware('cooldown', ({ interaction, command, next }, options) => {
  const seconds = (options?.seconds as number) ?? 5
  const scope = (options?.scope as string) ?? 'user'
  const scopeId = scope === 'guild' ? interaction.guildId : scope === 'channel' ? interaction.channelId : interaction.user.id
  const key = `${command?.name ?? 'unknown'}:${scopeId}`

  const now = Date.now()
  const expiresAt = cooldowns.get(key)
  if (expiresAt && now < expiresAt) {
    const remaining = Math.ceil((expiresAt - now) / 1000)
    throw new MiddlewareError(`Please wait ${remaining}s before using this command again.`, 'cooldown')
  }

  cooldowns.set(key, now + seconds * 1000)
  return next()
})
