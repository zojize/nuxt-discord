export default defineMessageContextMenu('Bookmark', (interaction) => {
  return reply.ephemeral(`Bookmarked: ${interaction.targetMessage.url}`)
})
