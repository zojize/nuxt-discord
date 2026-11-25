export default defineListener('clientReady', (client) => {
  // eslint-disable-next-line no-console
  console.log(`[Listener] Bot ready in ${client.guilds.cache.size} guilds`)
}, { once: true })
