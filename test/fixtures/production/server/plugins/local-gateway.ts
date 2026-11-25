import process from 'node:process'

export default defineNitroPlugin((nitro) => {
  const api = process.env.FIXTURE_DISCORD_API
  if (api) {
    nitro.hooks.hook('discord:client:config', (options) => {
      if (useRuntimeConfig().discord.sync !== false)
        throw new Error('Local gateway test requires command registration to be disabled')
      options.rest = { ...options.rest, api }
    })
  }
})
