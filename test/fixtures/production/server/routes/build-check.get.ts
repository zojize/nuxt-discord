export default defineEventHandler(() => ({
  prerender: import.meta.prerender,
  discordInitialized: Reflect.has(globalThis, Symbol.for('discord-client')),
}))
