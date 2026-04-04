export default defineListener('messageCreate', (message) => {
  if (message.author.bot)
    return
  if (message.content === '!hello') {
    message.reply('Hello from a listener!')
  }
})
