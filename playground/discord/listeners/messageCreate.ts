export default defineListener('messageCreate', (message) => {
  // Note: reading message.content requires the MessageContent privileged intent
  // Enable it in Discord Developer Portal → Bot → Privileged Gateway Intents
  if (message.author.bot)
    return
  if (message.content === '!hello') {
    message.reply('Hello from a listener!')
  }
})
