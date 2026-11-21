import { Client, Events } from 'discord.js'

export default defineEventHandler(async (event) => {
  const { name, user = 'member' } = await readBody(event)
  const bot = useDiscordClient()
  if (name === 'version')
    return bot.getSlashCommand('pull')?.description ?? '(removed)'
  if (!bot.internalClient) {
    Client.prototype.login = async function () {
      this.emit(Events.ClientReady, this)
      return 'offline'
    }
    await bot.start({ intents: [], deferOnPromise: false })
    await useStorage('data').setItem('label', 'pool')
  }
  let content
  await bot.internalClient!.listeners(Events.InteractionCreate)[0]!({
    commandName: name,
    user: { id: user },
    createdTimestamp: Date.now(),
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isUserContextMenuCommand: () => false,
    isMessageContextMenuCommand: () => false,
    options: { get: () => null },
    async reply(payload) { content = payload.content },
  })
  return { content }
})
