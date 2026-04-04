export default defineListener('ready', (client) => {
  // eslint-disable-next-line no-console
  console.log(`[Listener] Bot ready in ${client.guilds.cache.size} guilds`)
}, { once: true })
