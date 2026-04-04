import type { ClientEvents } from 'discord.js'

export interface ListenerDefinition<E extends keyof ClientEvents = keyof ClientEvents> {
  event: E
  execute: (...args: ClientEvents[E]) => void | Promise<void>
  once?: boolean
}

/**
 * Define a Discord event listener.
 *
 * @example
 * // discord/listeners/welcome.ts
 * export default defineListener('guildMemberAdd', (member) => {
 *   member.guild.systemChannel?.send(`Welcome ${member}!`)
 * })
 *
 * @example
 * // discord/listeners/ready.ts
 * export default defineListener('ready', (client) => {
 *   console.log(`Logged in as ${client.user.tag}`)
 * }, { once: true })
 */
export function defineListener<E extends keyof ClientEvents>(
  event: E,
  execute: (...args: ClientEvents[E]) => void | Promise<void>,
  options?: { once?: boolean },
): ListenerDefinition<E> {
  return {
    event,
    execute,
    once: options?.once,
  }
}
