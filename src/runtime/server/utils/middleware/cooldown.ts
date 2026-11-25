import { defineMiddleware, MiddlewareError } from '../defineMiddleware'

const cooldowns = new Map<string, number>()
let sweep: ReturnType<typeof setTimeout> | undefined

function scheduleSweep() {
  if (sweep)
    return
  sweep = setTimeout(() => {
    const now = Date.now()
    for (const [key, expiresAt] of cooldowns) {
      if (expiresAt <= now)
        cooldowns.delete(key)
    }
    sweep = undefined
    if (cooldowns.size)
      scheduleSweep()
  }, 60_000)
  sweep.unref()
}

export const cooldown = defineMiddleware('cooldown', ({ interaction, command, type, next }, options) => {
  const seconds = options?.seconds ?? 5
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0)
    throw new MiddlewareError('Cooldown duration must be a finite, nonnegative number.', 'cooldown')
  if (seconds === 0)
    return next()

  const scope = options?.scope ?? 'user'
  const scopeId = scope === 'guild' ? interaction.guildId : scope === 'channel' ? interaction.channelId : interaction.user.id
  const commandName = command?.path ?? ('commandName' in interaction ? interaction.commandName : command?.name)
  const commandType = 'commandType' in interaction ? interaction.commandType : type
  const key = JSON.stringify([interaction.applicationId, commandType, commandName, scope, scopeId ?? interaction.user.id])
  const now = Date.now()
  const expiresAt = cooldowns.get(key)
  if (expiresAt && now < expiresAt) {
    const remaining = Math.ceil((expiresAt - now) / 1000)
    throw new MiddlewareError(`Please wait ${remaining}s before using this command again.`, 'cooldown')
  }

  cooldowns.set(key, now + seconds * 1000)
  scheduleSweep()
  return next()
})
